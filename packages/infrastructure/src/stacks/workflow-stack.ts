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
  databaseStack?: DatabaseStack | undefined;  // Optional when using external database
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

    // Define job status/phase update helper steps
    const startProcessingStep = new stepfunctionsTask.LambdaInvoke(this, 'StartProcessingStep', {
      lambdaFunction: props.apiStack.jobManagementFunction,
      payload: stepfunctions.TaskInput.fromObject({
        action: 'start',
        'jobId.$': '$.jobId'
      }),
      // We don't need the result, preserve original input (jobId, pdfUrl)
      resultPath: stepfunctions.JsonPath.DISCARD,
      retryOnServiceExceptions: true,
      taskTimeout: stepfunctions.Timeout.duration(cdk.Duration.minutes(1))
    });

    const setPhaseAnalyzingStep = new stepfunctionsTask.LambdaInvoke(this, 'SetPhaseAnalyzingStep', {
      lambdaFunction: props.apiStack.jobManagementFunction,
      payload: stepfunctions.TaskInput.fromObject({
        action: 'phase',
        phase: 'analyzing_invoice',
        'jobId.$': '$.jobId'
      }),
      resultPath: stepfunctions.JsonPath.DISCARD,
      retryOnServiceExceptions: true,
      taskTimeout: stepfunctions.Timeout.duration(cdk.Duration.minutes(1))
    });

    const setPhaseExtractingStep = new stepfunctionsTask.LambdaInvoke(this, 'SetPhaseExtractingStep', {
      lambdaFunction: props.apiStack.jobManagementFunction,
      payload: stepfunctions.TaskInput.fromObject({
        action: 'phase',
        phase: 'extracting_data',
        'jobId.$': '$.jobId'
      }),
      resultPath: stepfunctions.JsonPath.DISCARD,
      retryOnServiceExceptions: true,
      taskTimeout: stepfunctions.Timeout.duration(cdk.Duration.minutes(1))
    });

    const setPhaseVerifyingStep = new stepfunctionsTask.LambdaInvoke(this, 'SetPhaseVerifyingStep', {
      lambdaFunction: props.apiStack.jobManagementFunction,
      payload: stepfunctions.TaskInput.fromObject({
        action: 'phase',
        phase: 'verifying_data',
        'jobId.$': '$.jobId'
      }),
      resultPath: stepfunctions.JsonPath.DISCARD,
      retryOnServiceExceptions: true,
      taskTimeout: stepfunctions.Timeout.duration(cdk.Duration.minutes(1))
    });

    // Define the OCR Processing step
    const ocrProcessingStep = new stepfunctionsTask.LambdaInvoke(this, 'OcrProcessingStep', {
      lambdaFunction: props.apiStack.ocrProcessingFunction,
      // Put only the Lambda payload in the task result and store it under $.ocr
      payloadResponseOnly: true,
      resultPath: '$.ocr',
      retryOnServiceExceptions: true,
      taskTimeout: stepfunctions.Timeout.duration(cdk.Duration.minutes(15))
    });

    // If OCR returned an error object (statusCode present), fail gracefully using that
    const ocrErrorChoice = new stepfunctions.Choice(this, 'OcrResultOk?');

    // Define the LLM Extraction step
    const llmExtractionStep = new stepfunctionsTask.LambdaInvoke(this, 'LlmExtractionStep', {
      lambdaFunction: props.apiStack.llmExtractionFunction,
      payloadResponseOnly: true,
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
      resultPath: stepfunctions.JsonPath.DISCARD,
      retryOnServiceExceptions: true,
      taskTimeout: stepfunctions.Timeout.duration(cdk.Duration.minutes(5))
    });

    // Separate fail steps to allow distinct Next targets per failure type
    const jobFailOcrStep = new stepfunctionsTask.LambdaInvoke(this, 'JobFailOcrStep', {
      lambdaFunction: props.apiStack.jobManagementFunction,
      payload: stepfunctions.TaskInput.fromObject({
        action: 'fail',
        'jobId.$': '$.jobId',
        'error.$': '$.error'
      }),
      resultPath: stepfunctions.JsonPath.DISCARD,
      retryOnServiceExceptions: true,
      taskTimeout: stepfunctions.Timeout.duration(cdk.Duration.minutes(2))
    });

    // Dedicated fail step that reads error from $.ocr (used when OCR returns error object)
    const jobFailFromOcrStep = new stepfunctionsTask.LambdaInvoke(this, 'JobFailFromOcrStep', {
      lambdaFunction: props.apiStack.jobManagementFunction,
      payload: stepfunctions.TaskInput.fromObject({
        action: 'fail',
        'jobId.$': '$.jobId',
        'error.$': '$.ocr'
      }),
      resultPath: stepfunctions.JsonPath.DISCARD,
      retryOnServiceExceptions: true,
      taskTimeout: stepfunctions.Timeout.duration(cdk.Duration.minutes(2))
    });

    const jobFailLlmStep = new stepfunctionsTask.LambdaInvoke(this, 'JobFailLlmStep', {
      lambdaFunction: props.apiStack.jobManagementFunction,
      payload: stepfunctions.TaskInput.fromObject({
        action: 'fail',
        'jobId.$': '$.jobId',
        'error.$': '$.error'
      }),
      resultPath: stepfunctions.JsonPath.DISCARD,
      retryOnServiceExceptions: true,
      taskTimeout: stepfunctions.Timeout.duration(cdk.Duration.minutes(2))
    });

    const jobFailCompleteStep = new stepfunctionsTask.LambdaInvoke(this, 'JobFailCompleteStep', {
      lambdaFunction: props.apiStack.jobManagementFunction,
      payload: stepfunctions.TaskInput.fromObject({
        action: 'fail',
        'jobId.$': '$.jobId',
        'error.$': '$.error'
      }),
      resultPath: stepfunctions.JsonPath.DISCARD,
      retryOnServiceExceptions: true,
      taskTimeout: stepfunctions.Timeout.duration(cdk.Duration.minutes(2))
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

    // Build the success path after OCR as a chain
    const successFlow = stepfunctions.Chain
      .start(
        setPhaseExtractingStep
          .addRetry({ maxAttempts: 3, backoffRate: 2.0, interval: cdk.Duration.seconds(2), maxDelay: cdk.Duration.seconds(30) as any })
          .addCatch(jobFailLlmStep, { errors: ['States.ALL'], resultPath: '$.error' })
      )
      .next(
        llmExtractionStep
          .addRetry({ maxAttempts: 3, backoffRate: 2.0, interval: cdk.Duration.seconds(2), maxDelay: cdk.Duration.seconds(30) as any })
          .addCatch(jobFailLlmStep, { errors: ['States.ALL'], resultPath: '$.error' })
      )
      .next(
        setPhaseVerifyingStep
          .addRetry({ maxAttempts: 3, backoffRate: 2.0, interval: cdk.Duration.seconds(2), maxDelay: cdk.Duration.seconds(30) as any })
          .addCatch(jobFailCompleteStep, { errors: ['States.ALL'], resultPath: '$.error' })
      )
      .next(
        jobCompletionStep
          .addRetry({ maxAttempts: 3, backoffRate: 2.0, interval: cdk.Duration.seconds(2), maxDelay: cdk.Duration.seconds(30) as any })
          .addCatch(jobFailCompleteStep, { errors: ['States.ALL'], resultPath: '$.error' })
      )
      .next(successState);

    // Create the workflow definition with error handling
    const definition = startProcessingStep
      .addRetry({ maxAttempts: 3, backoffRate: 2.0, interval: cdk.Duration.seconds(2), maxDelay: cdk.Duration.seconds(30) as any })
      .addCatch(jobFailOcrStep, { errors: ['States.ALL'], resultPath: '$.error' })
      .next(
        setPhaseAnalyzingStep
          .addRetry({ maxAttempts: 3, backoffRate: 2.0, interval: cdk.Duration.seconds(2), maxDelay: cdk.Duration.seconds(30) as any })
          .addCatch(jobFailOcrStep, { errors: ['States.ALL'], resultPath: '$.error' })
      )
      .next(
        ocrProcessingStep
          .addRetry({ maxAttempts: 3, backoffRate: 2.0, interval: cdk.Duration.seconds(2), maxDelay: cdk.Duration.seconds(30) as any })
          .addCatch(jobFailOcrStep, { errors: ['States.ALL'], resultPath: '$.error' })
      )
      .next(
        ocrErrorChoice
          .when(stepfunctions.Condition.isPresent('$.ocr.statusCode'), jobFailFromOcrStep)
          .otherwise(successFlow)
      );

    // Chain fail handlers to terminal Fail states (only once per handler)
    jobFailOcrStep.next(ocrFailedState);
    jobFailFromOcrStep.next(ocrFailedState);
    jobFailLlmStep.next(llmFailedState);
    jobFailCompleteStep.next(jobFailedState);

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

    // Note: Avoid adding references from ApiStack -> WorkflowStack to prevent cyclic dependencies.
    // You can set WORKFLOW_STATE_MACHINE_ARN on the JobManagement Lambda out-of-band if needed,
    // or grant permissions via a wildcard IAM policy in ApiStack.

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
