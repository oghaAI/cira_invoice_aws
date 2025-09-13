import { App, Stack } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { describe, it, expect } from 'vitest';
import { ApiStack } from './api-stack';
import { DatabaseStack } from './database-stack';
import { EnvironmentConfig } from '../config';

describe('ApiStack', () => {
  const mockConfig: EnvironmentConfig = {
    envName: 'test',
    region: 'us-east-1',
    account: '123456789012'
  };

  let app: App;
  let databaseStack: DatabaseStack;

  beforeEach(() => {
    app = new App();
    databaseStack = new DatabaseStack(app, 'TestDatabaseStack', {
      config: mockConfig
    });
  });

  it('should create API Gateway V2 with CORS configuration', () => {
    const stack = new ApiStack(app, 'TestApiStack', {
      config: mockConfig,
      databaseStack
    });

    const template = Template.fromStack(stack);

    // Verify HTTP API is created
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      Name: Match.anyValue(),
      ProtocolType: 'HTTP',
      CorsConfiguration: {
        AllowCredentials: true,
        AllowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key'],
        AllowMethods: ['GET', 'POST', 'OPTIONS'],
        MaxAge: 86400 // 1 day in seconds
      }
    });
  });

  it('should create Lambda functions with reserved concurrency', () => {
    const stack = new ApiStack(app, 'TestApiStack', {
      config: mockConfig,
      databaseStack
    });

    const template = Template.fromStack(stack);

    // Verify Lambda functions are created
    template.resourceCountIs('AWS::Lambda::Function', 3);

    // Verify reserved concurrency settings
    template.hasResourceProperties('AWS::Lambda::Function', {
      ReservedConcurrencyExecutions: 50 // Job Management
    });

    template.hasResourceProperties('AWS::Lambda::Function', {
      ReservedConcurrencyExecutions: 25 // OCR Processing
    });

    template.hasResourceProperties('AWS::Lambda::Function', {
      ReservedConcurrencyExecutions: 25 // LLM Extraction
    });
  });

  it('should create Lambda functions in VPC with proper security groups', () => {
    const stack = new ApiStack(app, 'TestApiStack', {
      config: mockConfig,
      databaseStack
    });

    const template = Template.fromStack(stack);

    // Verify Lambda functions have VPC configuration
    template.hasResourceProperties('AWS::Lambda::Function', {
      VpcConfig: {
        SecurityGroupIds: Match.anyValue(),
        SubnetIds: Match.anyValue()
      }
    });

    // Verify security group for Lambda functions is created
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: 'Security group for Lambda functions'
    });
  });

  it('should create API routes for job management', () => {
    const stack = new ApiStack(app, 'TestApiStack', {
      config: mockConfig,
      databaseStack
    });

    const template = Template.fromStack(stack);

    // Verify API routes are created
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'POST /jobs'
    });

    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'GET /jobs/{jobId}'
    });

    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'GET /jobs/{jobId}/status'
    });
  });

  it('should create stage with throttling configuration', () => {
    const stack = new ApiStack(app, 'TestApiStack', {
      config: mockConfig,
      databaseStack
    });

    const template = Template.fromStack(stack);

    // Verify stage with throttling is created
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      StageName: '$default',
      AutoDeploy: true,
      ThrottleSettings: {
        RateLimit: 1000,
        BurstLimit: 2000
      }
    });
  });

  it('should grant Lambda functions access to RDS secrets', () => {
    const stack = new ApiStack(app, 'TestApiStack', {
      config: mockConfig,
      databaseStack
    });

    const template = Template.fromStack(stack);

    // Verify IAM policies are created for secret access
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Action: Match.arrayWith(['secretsmanager:GetSecretValue'])
          })
        ])
      }
    });
  });

  it('should have proper outputs', () => {
    const stack = new ApiStack(app, 'TestApiStack', {
      config: mockConfig,
      databaseStack
    });

    const template = Template.fromStack(stack);

    // Verify outputs exist
    template.hasOutput('ApiEndpoint', {});
    template.hasOutput('ApiId', {});
    template.hasOutput('JobManagementFunctionArn', {});
    template.hasOutput('OcrProcessingFunctionArn', {});
    template.hasOutput('LlmExtractionFunctionArn', {});
  });
});
