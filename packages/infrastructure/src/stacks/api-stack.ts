import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';
import { DatabaseStack } from './database-stack';

export interface ApiStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
  databaseStack: DatabaseStack;
}

export class ApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly jobManagementFunction: lambdaNodejs.NodejsFunction;
  public readonly ocrProcessingFunction: lambdaNodejs.NodejsFunction;
  public readonly llmExtractionFunction: lambdaNodejs.NodejsFunction;
  public readonly dbMigrateFunction?: lambdaNodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // Create security group for Lambda functions
    const lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc: props.databaseStack.vpc as unknown as ec2.IVpc,
      description: 'Security group for Lambda functions',
      allowAllOutbound: true
    });

    // Database security group already allows VPC CIDR access
    // No need to add specific Lambda SG rule since Lambda functions are in the same VPC

    // Create environment variables for Lambda functions
    const lambdaEnvironment = {
      DATABASE_PROXY_ENDPOINT: props.databaseStack.databaseProxy.endpoint,
      DATABASE_SECRET_ARN: props.databaseStack.database.secret!.secretArn,
      DATABASE_NAME: 'cira_invoice'
    };

    // Create IAM role for Lambda functions
    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole')]
    });

    // Grant Lambda access to RDS secrets
    props.databaseStack.database.secret!.grantRead(lambdaRole);

    // Allow Job Management Lambda to start Step Functions executions without
    // creating a cross-stack reference to the specific State Machine ARN.
    // Scoped to current account/region state machines.
    const region = cdk.Stack.of(this).region;
    const account = cdk.Stack.of(this).account;
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['states:StartExecution'],
        resources: [`arn:aws:states:${region}:${account}:stateMachine:*`]
      })
    );

    // Job Management Lambda Function
    this.jobManagementFunction = new lambdaNodejs.NodejsFunction(this, 'JobManagementFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: '../api/src/handlers/job-management.ts',
      environment: lambdaEnvironment,
      vpc: props.databaseStack.vpc as unknown as ec2.IVpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED
      },
      securityGroups: [lambdaSecurityGroup],
      role: lambdaRole,
      timeout: cdk.Duration.minutes(15),
      memorySize: 512,
      // reservedConcurrentExecutions: 10, // Commented out due to account limits
      bundling: {
        externalModules: ['aws-sdk']
      }
    });

    // OCR Processing Lambda Function
    this.ocrProcessingFunction = new lambdaNodejs.NodejsFunction(this, 'OcrProcessingFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: '../api/src/handlers/ocr-processing.ts',
      environment: {
        ...lambdaEnvironment,
        OCR_PROVIDER: process.env['OCR_PROVIDER'] ?? 'mistral',
        MISTRAL_OCR_API_URL: process.env['MISTRAL_OCR_API_URL'] ?? '',
        MISTRAL_API_KEY: process.env['MISTRAL_API_KEY'] ?? '',
        ALLOWED_PDF_HOSTS: process.env['ALLOWED_PDF_HOSTS'] ?? 'api.ciranet.com',
        OCR_TEXT_MAX_BYTES: process.env['OCR_TEXT_MAX_BYTES'] ?? '1048576',
        OCR_RETRIEVAL_MAX_BYTES: process.env['OCR_RETRIEVAL_MAX_BYTES'] ?? '262144'
      },
      vpc: props.databaseStack.vpc as unknown as ec2.IVpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      },
      securityGroups: [lambdaSecurityGroup],
      role: lambdaRole,
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      bundling: {
        externalModules: ['aws-sdk']
      }
    });

    // LLM Extraction Lambda Function
    this.llmExtractionFunction = new lambdaNodejs.NodejsFunction(this, 'LlmExtractionFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: '../api/src/handlers/llm-extraction.ts',
      environment: lambdaEnvironment,
      vpc: props.databaseStack.vpc as unknown as ec2.IVpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      },
      securityGroups: [lambdaSecurityGroup],
      role: lambdaRole,
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      bundling: {
        externalModules: ['aws-sdk']
      }
    });

    // One-off DB migration function (invoke manually post-deploy)
    this.dbMigrateFunction = new lambdaNodejs.NodejsFunction(this, 'DbMigrateFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.resolve(__dirname, '../../src/migrations/run-schema.ts'),
      environment: {
        SECRET_ARN: props.databaseStack.database.secret!.secretArn,
        DB_HOST: props.databaseStack.database.instanceEndpoint.hostname,
        DB_NAME: 'cira_invoice'
      },
      vpc: props.databaseStack.vpc as unknown as ec2.IVpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      },
      securityGroups: [lambdaSecurityGroup],
      role: lambdaRole,
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      bundling: {
        externalModules: ['aws-sdk']
      }
    });

    // Create REST API (API Gateway V1) to support API Keys and Usage Plans
    this.api = new apigateway.RestApi(this, 'CiraInvoiceApi', {
      restApiName: 'CIRA Invoice Processing API',
      description: 'CIRA Invoice Processing API',
      defaultCorsPreflightOptions: {
        allowCredentials: props.config.environment === 'prod',
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key'],
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowOrigins:
          props.config.environment === 'prod'
            ? ['https://cira-invoice.com']
            : ['http://localhost:3000', 'http://127.0.0.1:3000']
      },
      deployOptions: {
        stageName: props.config.environment,
        throttlingBurstLimit: 50,
        throttlingRateLimit: 100
      }
    });

    // API Key and Usage Plan
    const apiKey = this.api.addApiKey('DefaultApiKey', {
      apiKeyName: `cira-${props.config.environment}-default-key`
    });

    const usagePlan = this.api.addUsagePlan('DefaultUsagePlan', {
      name: `cira-${props.config.environment}-default-plan`,
      throttle: {
        burstLimit: 50,
        rateLimit: 100
      },
      quota:
        props.config.environment === 'prod'
          ? { limit: 1_000_000, period: apigateway.Period.MONTH }
          : { limit: 100_000, period: apigateway.Period.MONTH }
    });

    usagePlan.addApiKey(apiKey);
    usagePlan.addApiStage({
      stage: this.api.deploymentStage
    });

    // Health endpoint at root (no API key required) -> handled by job management Lambda to enable DB check
    const lambdaIntegration = new apigateway.LambdaIntegration(this.jobManagementFunction);
    this.api.root.addMethod('GET', lambdaIntegration, {
      apiKeyRequired: false,
      methodResponses: [{ statusCode: '200' }]
    });

    // Methods require API Key
    const jobsResource = this.api.root.addResource('jobs');
    const jobByIdResource = jobsResource.addResource('{jobId}');
    const jobStatusResource = jobByIdResource.addResource('status');
    const jobOcrResource = jobByIdResource.addResource('ocr');

    jobsResource.addMethod('POST', lambdaIntegration, { apiKeyRequired: true });
    jobByIdResource.addMethod('GET', lambdaIntegration, { apiKeyRequired: true });
    jobStatusResource.addMethod('GET', lambdaIntegration, { apiKeyRequired: true });
    jobOcrResource.addMethod('GET', lambdaIntegration, { apiKeyRequired: true });

    // Outputs
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.api.url,
      description: 'API Gateway endpoint URL'
    });

    new cdk.CfnOutput(this, 'ApiId', {
      value: this.api.restApiId,
      description: 'API Gateway ID'
    });

    new cdk.CfnOutput(this, 'JobManagementFunctionArn', {
      value: this.jobManagementFunction.functionArn,
      description: 'Job Management Lambda Function ARN'
    });

    new cdk.CfnOutput(this, 'OcrProcessingFunctionArn', {
      value: this.ocrProcessingFunction.functionArn,
      description: 'OCR Processing Lambda Function ARN'
    });

    new cdk.CfnOutput(this, 'LlmExtractionFunctionArn', {
      value: this.llmExtractionFunction.functionArn,
      description: 'LLM Extraction Lambda Function ARN'
    });

    new cdk.CfnOutput(this, 'DbMigrateFunctionArn', {
      value: this.dbMigrateFunction.functionArn,
      description: 'DB Migration Lambda Function ARN (invoke once post-deploy)'
    });
  }
}
