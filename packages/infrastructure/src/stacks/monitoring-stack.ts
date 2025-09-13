import * as cdk from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';
import { ApiStack } from './api-stack';
import { DatabaseStack } from './database-stack';
import { WorkflowStack } from './workflow-stack';

export interface MonitoringStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
  apiStack: ApiStack;
  databaseStack: DatabaseStack;
  workflowStack: WorkflowStack;
}

export class MonitoringStack extends cdk.Stack {
  public readonly logGroups: logs.ILogGroup[];
  public readonly alarmTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    // Create SNS topic for alarms
    this.alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      displayName: 'CIRA Invoice Processing Alarms'
    });

    // Add email subscription for production environment
    if (props.config.environment === 'prod') {
      this.alarmTopic.addSubscription(
        new snsSubscriptions.EmailSubscription('admin@cira-invoice.com') // Replace with actual email
      );
    }

    // Reference existing Lambda log groups (do not recreate)
    const jobManagementLogGroup = logs.LogGroup.fromLogGroupName(
      this,
      'JobManagementLogGroup',
      `/aws/lambda/${props.apiStack.jobManagementFunction.functionName}`
    );

    // Pre-create log groups for OCR and LLM (they may not exist until first invocation)
    const ocrProcessingLogGroup = new logs.LogGroup(this, 'OcrProcessingLogGroup', {
      logGroupName: `/aws/lambda/${props.apiStack.ocrProcessingFunction.functionName}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: props.config.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY
    });

    const llmExtractionLogGroup = new logs.LogGroup(this, 'LlmExtractionLogGroup', {
      logGroupName: `/aws/lambda/${props.apiStack.llmExtractionFunction.functionName}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: props.config.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY
    });

    // Create API Gateway access logs
    const apiAccessLogGroup = new logs.LogGroup(this, 'ApiAccessLogGroup', {
      logGroupName: `/aws/apigateway/${props.apiStack.api.restApiId}/access`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: props.config.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY
    });

    this.logGroups = [jobManagementLogGroup, ocrProcessingLogGroup, llmExtractionLogGroup, apiAccessLogGroup];

    // Create log filters for error tracking
    new logs.MetricFilter(this, 'ErrorFilter', {
      logGroup: jobManagementLogGroup,
      metricNamespace: 'CIRA/InvoiceProcessing',
      metricName: 'Errors',
      filterPattern: logs.FilterPattern.anyTerm('ERROR', 'error', 'Error'),
      metricValue: '1',
      defaultValue: 0
    });

    new logs.MetricFilter(this, 'OcrErrorFilter', {
      logGroup: ocrProcessingLogGroup,
      metricNamespace: 'CIRA/InvoiceProcessing',
      metricName: 'OcrErrors',
      filterPattern: logs.FilterPattern.anyTerm('ERROR', 'error', 'Error'),
      metricValue: '1',
      defaultValue: 0
    });

    new logs.MetricFilter(this, 'LlmErrorFilter', {
      logGroup: llmExtractionLogGroup,
      metricNamespace: 'CIRA/InvoiceProcessing',
      metricName: 'LlmErrors',
      filterPattern: logs.FilterPattern.anyTerm('ERROR', 'error', 'Error'),
      metricValue: '1',
      defaultValue: 0
    });

    // Create CloudWatch alarms for Lambda function monitoring

    // Job Management Function Alarms
    const jobManagementErrorAlarm = new cloudwatch.Alarm(this, 'JobManagementErrorAlarm', {
      metric: props.apiStack.jobManagementFunction.metricErrors({
        period: cdk.Duration.minutes(5)
      }),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    jobManagementErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));

    const jobManagementConcurrencyAlarm = new cloudwatch.Alarm(this, 'JobManagementConcurrencyAlarm', {
      metric: new cloudwatch.MathExpression({
        expression: 'm1',
        usingMetrics: {
          m1: props.apiStack.jobManagementFunction.metric('ConcurrentExecutions', {
            period: cdk.Duration.minutes(1),
            statistic: 'Maximum'
          })
        }
      }),
      threshold: 45, // 90% of reserved concurrency (50)
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    jobManagementConcurrencyAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));

    // OCR Processing Function Alarms
    const ocrErrorAlarm = new cloudwatch.Alarm(this, 'OcrErrorAlarm', {
      metric: props.apiStack.ocrProcessingFunction.metricErrors({
        period: cdk.Duration.minutes(5)
      }),
      threshold: 3,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    ocrErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));

    const ocrConcurrencyAlarm = new cloudwatch.Alarm(this, 'OcrConcurrencyAlarm', {
      metric: new cloudwatch.MathExpression({
        expression: 'm1',
        usingMetrics: {
          m1: props.apiStack.ocrProcessingFunction.metric('ConcurrentExecutions', {
            period: cdk.Duration.minutes(1),
            statistic: 'Maximum'
          })
        }
      }),
      threshold: 22, // 90% of reserved concurrency (25)
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    ocrConcurrencyAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));

    // LLM Extraction Function Alarms
    const llmErrorAlarm = new cloudwatch.Alarm(this, 'LlmErrorAlarm', {
      metric: props.apiStack.llmExtractionFunction.metricErrors({
        period: cdk.Duration.minutes(5)
      }),
      threshold: 3,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    llmErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));

    const llmConcurrencyAlarm = new cloudwatch.Alarm(this, 'LlmConcurrencyAlarm', {
      metric: new cloudwatch.MathExpression({
        expression: 'm1',
        usingMetrics: {
          m1: props.apiStack.llmExtractionFunction.metric('ConcurrentExecutions', {
            period: cdk.Duration.minutes(1),
            statistic: 'Maximum'
          })
        }
      }),
      threshold: 22, // 90% of reserved concurrency (25)
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    llmConcurrencyAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));

    // API Gateway Alarms
    const apiErrorAlarm = new cloudwatch.Alarm(this, 'ApiErrorAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5XXError',
        dimensionsMap: {
          ApiName: props.apiStack.api.restApiId
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Sum'
      }),
      threshold: 10,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    apiErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));

    // Step Functions Alarms
    const stepFunctionFailureAlarm = new cloudwatch.Alarm(this, 'StepFunctionFailureAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/States',
        metricName: 'ExecutionsFailed',
        dimensionsMap: {
          StateMachineArn: props.workflowStack.stateMachine.stateMachineArn
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Sum'
      }),
      threshold: 5,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    stepFunctionFailureAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));

    // Database connection alarms
    const dbConnectionAlarm = new cloudwatch.Alarm(this, 'DbConnectionAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'DatabaseConnections',
        dimensionsMap: {
          DBInstanceIdentifier: props.databaseStack.database.instanceIdentifier
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Average'
      }),
      threshold: 80, // 80% of max connections
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    dbConnectionAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));

    // Create a CloudWatch Dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'InvoiceProcessingDashboard', {
      dashboardName: `${props.config.environment}-invoice-processing-dashboard`
    });

    // Add Lambda function metrics to dashboard
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Function Invocations',
        left: [
          props.apiStack.jobManagementFunction.metricInvocations(),
          props.apiStack.ocrProcessingFunction.metricInvocations(),
          props.apiStack.llmExtractionFunction.metricInvocations()
        ],
        period: cdk.Duration.minutes(5)
      }) as unknown as cloudwatch.IWidget,
      new cloudwatch.GraphWidget({
        title: 'Lambda Function Errors',
        left: [
          props.apiStack.jobManagementFunction.metricErrors(),
          props.apiStack.ocrProcessingFunction.metricErrors(),
          props.apiStack.llmExtractionFunction.metricErrors()
        ],
        period: cdk.Duration.minutes(5)
      }) as unknown as cloudwatch.IWidget
    );

    // Outputs
    new cdk.CfnOutput(this, 'JobManagementLogGroupOutput', {
      value: jobManagementLogGroup.logGroupName,
      description: 'Job Management Lambda Function log group'
    });

    new cdk.CfnOutput(this, 'OcrProcessingLogGroupOutput', {
      value: ocrProcessingLogGroup.logGroupName,
      description: 'OCR Processing Lambda Function log group'
    });

    new cdk.CfnOutput(this, 'LlmExtractionLogGroupOutput', {
      value: llmExtractionLogGroup.logGroupName,
      description: 'LLM Extraction Lambda Function log group'
    });

    new cdk.CfnOutput(this, 'ApiAccessLogGroupOutput', {
      value: apiAccessLogGroup.logGroupName,
      description: 'API Gateway access log group'
    });

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${dashboard.dashboardName}`,
      description: 'CloudWatch Dashboard URL'
    });

    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: this.alarmTopic.topicArn,
      description: 'SNS Topic ARN for alarms'
    });
  }
}
