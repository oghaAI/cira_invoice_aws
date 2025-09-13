import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { describe, it, expect } from 'vitest';
import { WorkflowStack } from './workflow-stack';
import { DatabaseStack } from './database-stack';
import { ApiStack } from './api-stack';
import { EnvironmentConfig } from '../config';

describe('WorkflowStack', () => {
  const mockConfig: EnvironmentConfig = {
    envName: 'test',
    region: 'us-east-1',
    account: '123456789012'
  };

  let app: App;
  let databaseStack: DatabaseStack;
  let apiStack: ApiStack;

  beforeEach(() => {
    app = new App();
    databaseStack = new DatabaseStack(app, 'TestDatabaseStack', {
      config: mockConfig
    });
    apiStack = new ApiStack(app, 'TestApiStack', {
      config: mockConfig,
      databaseStack
    });
  });

  it('should create Step Functions state machine', () => {
    const stack = new WorkflowStack(app, 'TestWorkflowStack', {
      config: mockConfig,
      databaseStack,
      apiStack
    });

    const template = Template.fromStack(stack);

    // Verify State Machine is created
    template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
      DefinitionString: Match.anyValue(),
      RoleArn: Match.anyValue(),
      LoggingConfiguration: {
        Level: 'ALL',
        IncludeExecutionData: true,
        Destinations: Match.arrayWith([
          Match.objectLike({
            CloudWatchLogsLogGroup: Match.anyValue()
          })
        ])
      }
    });
  });

  it('should create CloudWatch Log Group for Step Functions', () => {
    const stack = new WorkflowStack(app, 'TestWorkflowStack', {
      config: mockConfig,
      databaseStack,
      apiStack
    });

    const template = Template.fromStack(stack);

    // Verify Log Group is created
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: `/aws/stepfunctions/${mockConfig.envName}-invoice-processing`,
      RetentionInDays: 30
    });
  });

  it('should create IAM role for Step Functions with Lambda invoke permissions', () => {
    const stack = new WorkflowStack(app, 'TestWorkflowStack', {
      config: mockConfig,
      databaseStack,
      apiStack
    });

    const template = Template.fromStack(stack);

    // Verify Step Functions role is created
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Service: 'states.amazonaws.com'
            },
            Action: 'sts:AssumeRole'
          }
        ]
      }
    });

    // Verify Lambda invoke permissions
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Action: 'lambda:InvokeFunction'
          })
        ])
      }
    });
  });

  it('should have proper outputs', () => {
    const stack = new WorkflowStack(app, 'TestWorkflowStack', {
      config: mockConfig,
      databaseStack,
      apiStack
    });

    const template = Template.fromStack(stack);

    // Verify outputs exist
    template.hasOutput('StateMachineArn', {});
    template.hasOutput('StateMachineName', {});
    template.hasOutput('LogGroupName', {});
  });

  it('should configure production-specific retention for production environment', () => {
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

    const stack = new WorkflowStack(app, 'TestWorkflowStack', {
      config: prodConfig,
      databaseStack: prodDatabaseStack,
      apiStack: prodApiStack
    });

    const template = Template.fromStack(stack);

    // Verify production log retention
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: `/aws/stepfunctions/production-invoice-processing`
    });
  });
});
