import * as cdk from 'aws-cdk-lib';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as stepfunctionsTask from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';
import { ApiStack } from './api-stack';
import { DatabaseStack } from './database-stack';

export interface WorkflowStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
  databaseStack: DatabaseStack;
  apiStack: ApiStack;
}

export class WorkflowStack extends cdk.Stack {
  public readonly stateMachine: stepfunctions.StateMachine;

  constructor(scope: Construct, id: string, props: WorkflowStackProps) {
    super(scope, id, props);

    // Create CloudWatch Log Group for Step Functions
    const logGroup = new logs.LogGroup(this, 'InvoiceProcessingLogGroup', {
      logGroupName: `/aws/stepfunctions/${props.config.environment}-invoice-processing`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: props.config.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY
    });

    // Define the OCR Processing step
    const ocrProcessingStep = new stepfunctionsTask.LambdaInvoke(this, 'OcrProcessingStep', {
      lambdaFunction: props.apiStack.ocrProcessingFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
      taskTimeout: stepfunctions.Timeout.duration(cdk.Duration.minutes(15))
    });

    // Define the LLM Extraction step
    const llmExtractionStep = new stepfunctionsTask.LambdaInvoke(this, 'LlmExtractionStep', {
      lambdaFunction: props.apiStack.llmExtractionFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
      taskTimeout: stepfunctions.Timeout.duration(cdk.Duration.minutes(15))
    });

    // Define the Job Completion step
    const jobCompletionStep = new stepfunctionsTask.LambdaInvoke(this, 'JobCompletionStep', {
      lambdaFunction: props.apiStack.jobManagementFunction,
      payload: stepfunctions.TaskInput.fromObject({
        action: 'complete',
        'jobId.$': '$.jobId',
        'result.$': '$.result',
        'metadata.$': '$.metadata'
      }),
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
      taskTimeout: stepfunctions.Timeout.duration(cdk.Duration.minutes(5))
    });

    // Define error handling states
    const ocrFailedState = new stepfunctions.Fail(this, 'OcrFailed', {
      cause: 'OCR Processing failed',
      error: 'OcrProcessingError'
    });

    const llmFailedState = new stepfunctions.Fail(this, 'LlmFailed', {
      cause: 'LLM Extraction failed',
      error: 'LlmExtractionError'
    });

    const jobFailedState = new stepfunctions.Fail(this, 'JobFailed', {
      cause: 'Job completion failed',
      error: 'JobCompletionError'
    });

    const successState = new stepfunctions.Succeed(this, 'ProcessingSucceeded', {
      comment: 'Invoice processing completed successfully'
    });

    // Create the workflow definition with error handling
    const definition = ocrProcessingStep
      .addCatch(ocrFailedState, {
        errors: ['States.ALL'],
        resultPath: '$.error'
      })
      .next(
        llmExtractionStep
          .addCatch(llmFailedState, {
            errors: ['States.ALL'],
            resultPath: '$.error'
          })
          .next(
            jobCompletionStep
              .addCatch(jobFailedState, {
                errors: ['States.ALL'],
                resultPath: '$.error'
              })
              .next(successState)
          )
      );

    // Create Step Functions IAM role
    const stepFunctionsRole = new iam.Role(this, 'StepFunctionsRole', {
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com')
    });

    // Grant Step Functions permission to invoke Lambda functions
    props.apiStack.ocrProcessingFunction.grantInvoke(stepFunctionsRole);
    props.apiStack.llmExtractionFunction.grantInvoke(stepFunctionsRole);
    props.apiStack.jobManagementFunction.grantInvoke(stepFunctionsRole);

    // Grant Step Functions permission to write to CloudWatch Logs
    logGroup.grantWrite(stepFunctionsRole);

    // Create the State Machine
    this.stateMachine = new stepfunctions.StateMachine(this, 'InvoiceProcessingStateMachine', {
      definitionBody: stepfunctions.DefinitionBody.fromChainable(definition),
      role: stepFunctionsRole,
      logs: {
        destination: logGroup,
        level: stepfunctions.LogLevel.ALL,
        includeExecutionData: true
      },
      timeout: cdk.Duration.minutes(30),
      comment: '3-step invoice processing workflow: OCR -> LLM Extraction -> Job Completion'
    });

    // Set concurrent execution limits for high throughput
    // Note: Step Functions Express workflows have built-in concurrency management
    // Standard workflows (like this one) are better for our use case with CloudWatch integration

    // Outputs
    new cdk.CfnOutput(this, 'StateMachineArn', {
      value: this.stateMachine.stateMachineArn,
      description: 'Step Functions State Machine ARN'
    });

    new cdk.CfnOutput(this, 'StateMachineName', {
      value: this.stateMachine.stateMachineName,
      description: 'Step Functions State Machine Name'
    });

    new cdk.CfnOutput(this, 'LogGroupName', {
      value: logGroup.logGroupName,
      description: 'CloudWatch Log Group for Step Functions'
    });
  }
}
