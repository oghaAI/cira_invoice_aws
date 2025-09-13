import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { describe, it, expect } from 'vitest';
import { MonitoringStack } from './monitoring-stack';
import { DatabaseStack } from './database-stack';
import { ApiStack } from './api-stack';
import { WorkflowStack } from './workflow-stack';
import { EnvironmentConfig } from '../config';

describe('MonitoringStack', () => {
  const mockConfig: EnvironmentConfig = {
    envName: 'test',
    region: 'us-east-1',
    account: '123456789012'
  };

  let app: App;
  let databaseStack: DatabaseStack;
  let apiStack: ApiStack;
  let workflowStack: WorkflowStack;

  beforeEach(() => {
    app = new App();
    databaseStack = new DatabaseStack(app, 'TestDatabaseStack', {
      config: mockConfig
    });
    apiStack = new ApiStack(app, 'TestApiStack', {
      config: mockConfig,
      databaseStack
    });
    workflowStack = new WorkflowStack(app, 'TestWorkflowStack', {
      config: mockConfig,
      databaseStack,
      apiStack
    });
  });

  it('should create CloudWatch Log Groups for Lambda functions', () => {
    const stack = new MonitoringStack(app, 'TestMonitoringStack', {
      config: mockConfig,
      apiStack,
      databaseStack,
      workflowStack
    });

    const template = Template.fromStack(stack);

    // Verify log groups are created for Lambda functions
    template.resourceCountIs('AWS::Logs::LogGroup', 4); // 3 Lambda + 1 API Gateway

    // Verify retention is set to 30 days
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      RetentionInDays: 30
    });
  });

  it('should create SNS topic for alarms', () => {
    const stack = new MonitoringStack(app, 'TestMonitoringStack', {
      config: mockConfig,
      apiStack,
      databaseStack,
      workflowStack
    });

    const template = Template.fromStack(stack);

    // Verify SNS topic is created
    template.hasResourceProperties('AWS::SNS::Topic', {
      DisplayName: 'CIRA Invoice Processing Alarms'
    });
  });

  it('should create CloudWatch alarms for Lambda functions', () => {
    const stack = new MonitoringStack(app, 'TestMonitoringStack', {
      config: mockConfig,
      apiStack,
      databaseStack,
      workflowStack
    });

    const template = Template.fromStack(stack);

    // Verify CloudWatch alarms are created
    template.resourceCountIs('AWS::CloudWatch::Alarm', 8); // Error + Concurrency for 3 functions + API + Step Functions + DB

    // Verify error alarms
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      MetricName: 'Errors',
      Namespace: 'AWS/Lambda',
      Threshold: 5
    });

    // Verify concurrency alarms
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      MetricName: 'ConcurrentExecutions',
      Namespace: 'AWS/Lambda',
      Threshold: 45 // 90% of 50 reserved concurrency
    });
  });

  it('should create metric filters for error tracking', () => {
    const stack = new MonitoringStack(app, 'TestMonitoringStack', {
      config: mockConfig,
      apiStack,
      databaseStack,
      workflowStack
    });

    const template = Template.fromStack(stack);

    // Verify metric filters are created
    template.resourceCountIs('AWS::Logs::MetricFilter', 3);

    // Verify error filter configuration
    template.hasResourceProperties('AWS::Logs::MetricFilter', {
      FilterPattern: '[..., level="ERROR" || level="error" || level="Error", ...]',
      MetricTransformations: [
        {
          MetricNamespace: 'CIRA/InvoiceProcessing',
          MetricName: Match.anyValue(),
          MetricValue: '1',
          DefaultValue: 0
        }
      ]
    });
  });

  it('should create CloudWatch dashboard', () => {
    const stack = new MonitoringStack(app, 'TestMonitoringStack', {
      config: mockConfig,
      apiStack,
      databaseStack,
      workflowStack
    });

    const template = Template.fromStack(stack);

    // Verify dashboard is created
    template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
      DashboardName: `${mockConfig.envName}-invoice-processing-dashboard`,
      DashboardBody: Match.anyValue()
    });
  });

  it('should create alarms for API Gateway and Step Functions', () => {
    const stack = new MonitoringStack(app, 'TestMonitoringStack', {
      config: mockConfig,
      apiStack,
      databaseStack,
      workflowStack
    });

    const template = Template.fromStack(stack);

    // Verify API Gateway alarm
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      MetricName: '5XXError',
      Namespace: 'AWS/ApiGateway',
      Threshold: 10
    });

    // Verify Step Functions alarm
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      MetricName: 'ExecutionsFailed',
      Namespace: 'AWS/States',
      Threshold: 5
    });
  });

  it('should create database connection alarm', () => {
    const stack = new MonitoringStack(app, 'TestMonitoringStack', {
      config: mockConfig,
      apiStack,
      databaseStack,
      workflowStack
    });

    const template = Template.fromStack(stack);

    // Verify database connection alarm
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      MetricName: 'DatabaseConnections',
      Namespace: 'AWS/RDS',
      Threshold: 80
    });
  });

  it('should have proper outputs', () => {
    const stack = new MonitoringStack(app, 'TestMonitoringStack', {
      config: mockConfig,
      apiStack,
      databaseStack,
      workflowStack
    });

    const template = Template.fromStack(stack);

    // Verify outputs exist
    template.hasOutput('JobManagementLogGroup', {});
    template.hasOutput('OcrProcessingLogGroup', {});
    template.hasOutput('LlmExtractionLogGroup', {});
    template.hasOutput('ApiAccessLogGroup', {});
    template.hasOutput('DashboardUrl', {});
    template.hasOutput('AlarmTopicArn', {});
  });

  it('should add email subscription for production environment', () => {
    const prodConfig: EnvironmentConfig = {
      envName: 'production',
      region: 'us-east-1',
      account: '123456789012'
    };

    const prodDatabaseStack = new DatabaseStack(app, 'ProdDatabaseStack', {
      config: prodConfig
    });

    const prodApiStack = new ApiStack(app, 'ProdApiStack', {
      config: prodConfig,
      databaseStack: prodDatabaseStack
    });

    const prodWorkflowStack = new WorkflowStack(app, 'ProdWorkflowStack', {
      config: prodConfig,
      databaseStack: prodDatabaseStack,
      apiStack: prodApiStack
    });

    const stack = new MonitoringStack(app, 'TestMonitoringStack', {
      config: prodConfig,
      apiStack: prodApiStack,
      databaseStack: prodDatabaseStack,
      workflowStack: prodWorkflowStack
    });

    const template = Template.fromStack(stack);

    // Verify email subscription is created for production
    template.hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'email',
      Endpoint: 'admin@cira-invoice.com'
    });
  });
});
