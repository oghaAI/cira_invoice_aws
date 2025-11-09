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
  databaseStack?: DatabaseStack | undefined;  // Optional when using external database
}

export class ApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly jobManagementFunction: lambdaNodejs.NodejsFunction;
  public readonly ocrProcessingFunction: lambdaNodejs.NodejsFunction;
  public readonly llmExtractionFunction: lambdaNodejs.NodejsFunction;
  public readonly dbMigrateFunction?: lambdaNodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // Determine if we're using RDS or external database
    const useRDS = !!props.databaseStack;

    // Lambda security group (only needed for VPC mode with RDS)
    let lambdaSecurityGroup: ec2.SecurityGroup | undefined;
    if (useRDS) {
      lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
        vpc: props.databaseStack!.vpc as unknown as ec2.IVpc,
        description: 'Security group for Lambda functions',
        allowAllOutbound: true
      });
    }

    // Create environment variables for Lambda functions
    // Two modes: RDS (with proxy endpoint and secrets) or External DB (with connection string)
    const lambdaEnvironment: Record<string, string> = useRDS
      ? {
          // RDS mode: Use RDS Proxy endpoint and Secrets Manager
          DATABASE_PROXY_ENDPOINT: props.databaseStack!.databaseProxy.endpoint,
          DATABASE_SECRET_ARN: props.databaseStack!.database.secret!.secretArn,
          DATABASE_NAME: 'cira_invoice'
        }
      : {
          // External DB mode: Use connection string from env or config
          DATABASE_URL: props.config.externalDatabaseUrl || process.env['DATABASE_URL'] || '',
          DATABASE_NAME: 'cira_invoice'
        };

    // Create IAM role for Lambda functions
    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      // Only use VPC execution role if Lambda is in VPC (RDS mode)
      managedPolicies: useRDS
        ? [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole')]
        : [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')]
    });

    // Grant Lambda access to RDS secrets (only in RDS mode)
    if (useRDS) {
      props.databaseStack!.database.secret!.grantRead(lambdaRole);
    }

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

    // Common Lambda configuration
    const commonLambdaConfig: Partial<lambdaNodejs.NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      role: lambdaRole,
      bundling: {
        externalModules: ['aws-sdk']
      }
    };

    // VPC configuration (only for RDS mode)
    const vpcConfig: Partial<lambdaNodejs.NodejsFunctionProps> = useRDS
      ? {
          vpc: props.databaseStack!.vpc as unknown as ec2.IVpc,
          vpcSubnets: {
            subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
          },
          securityGroups: [lambdaSecurityGroup!]
        }
      : {};

    // Job Management Lambda Function
    this.jobManagementFunction = new lambdaNodejs.NodejsFunction(this, 'JobManagementFunction', {
      ...commonLambdaConfig,
      ...vpcConfig,
      handler: 'handler',
      entry: '../api/src/handlers/job-management.ts',
      environment: lambdaEnvironment,
      timeout: cdk.Duration.minutes(15),
      memorySize: 512
      // reservedConcurrentExecutions: 10, // Commented out due to account limits
    });

    // OCR Processing Lambda Function
    // Build environment for OCR function, ensuring only string values are set
    const ocrEnv: Record<string, string> = {
      ...lambdaEnvironment,
      OCR_PROVIDER: process.env['OCR_PROVIDER'] ?? 'mistral',
      MISTRAL_OCR_API_URL: process.env['MISTRAL_OCR_API_URL'] ?? '',
      MISTRAL_API_KEY: process.env['MISTRAL_API_KEY'] ?? '',
      INTERNAL_OCR_URL: process.env['INTERNAL_OCR_URL'] ?? process.env['OCR_INTERNAL_URL'] ?? '',
      ALLOWED_PDF_HOSTS: process.env['ALLOWED_PDF_HOSTS'] ?? 'api.ciranet.com',
      OCR_TEXT_MAX_BYTES: process.env['OCR_TEXT_MAX_BYTES'] ?? '1048576',
      OCR_RETRIEVAL_MAX_BYTES: process.env['OCR_RETRIEVAL_MAX_BYTES'] ?? '262144'
    };
    if (process.env['MISTRAL_OCR_MODE']) ocrEnv['MISTRAL_OCR_MODE'] = process.env['MISTRAL_OCR_MODE'] as string;
    if (process.env['MISTRAL_OCR_SYNC_PATH']) ocrEnv['MISTRAL_OCR_SYNC_PATH'] = process.env['MISTRAL_OCR_SYNC_PATH'] as string;
    if (process.env['MISTRAL_OCR_MODEL']) ocrEnv['MISTRAL_OCR_MODEL'] = process.env['MISTRAL_OCR_MODEL'] as string;
    if (process.env['MISTRAL_INCLUDE_IMAGE_BASE64']) ocrEnv['MISTRAL_INCLUDE_IMAGE_BASE64'] = process.env['MISTRAL_INCLUDE_IMAGE_BASE64'] as string;
    if (process.env['OCR_DEBUG']) ocrEnv['OCR_DEBUG'] = process.env['OCR_DEBUG'] as string;

    this.ocrProcessingFunction = new lambdaNodejs.NodejsFunction(this, 'OcrProcessingFunction', {
      ...commonLambdaConfig,
      ...vpcConfig,
      handler: 'handler',
      entry: '../api/src/handlers/ocr-processing.ts',
      environment: ocrEnv,
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024
    });

    // LLM Extraction Lambda Function
    const llmEnv: Record<string, string> = {
      ...lambdaEnvironment,
      // Azure-hosted model configuration (supports both new and legacy envs)
      AZURE_API_ENDPOINT:
        process.env['AZURE_API_ENDPOINT'] ?? process.env['AZURE_OPENAI_ENDPOINT'] ?? '',
      AZURE_API_KEY: process.env['AZURE_API_KEY'] ?? process.env['AZURE_OPENAI_API_KEY'] ?? '',
      AZURE_MODEL: process.env['AZURE_MODEL'] ?? process.env['AZURE_OPENAI_DEPLOYMENT'] ?? '',
      AZURE_OPENAI_API_VERSION: process.env['AZURE_OPENAI_API_VERSION'] ?? '2024-08-01-preview'
    };

    // Add Langfuse tracing configuration if provided
    if (process.env['LANGFUSE_PUBLIC_KEY']) {
      llmEnv['LANGFUSE_PUBLIC_KEY'] = process.env['LANGFUSE_PUBLIC_KEY'];
    }
    if (process.env['LANGFUSE_SECRET_KEY']) {
      llmEnv['LANGFUSE_SECRET_KEY'] = process.env['LANGFUSE_SECRET_KEY'];
    }
    if (process.env['LANGFUSE_HOST']) {
      llmEnv['LANGFUSE_HOST'] = process.env['LANGFUSE_HOST'];
    }

    this.llmExtractionFunction = new lambdaNodejs.NodejsFunction(this, 'LlmExtractionFunction', {
      ...commonLambdaConfig,
      ...vpcConfig,
      handler: 'handler',
      entry: '../api/src/handlers/llm-extraction.ts',
      environment: llmEnv,
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024
    });

    // One-off DB migration function (invoke manually post-deploy)
    // Only create this function when using RDS (not needed for external database)
    if (useRDS) {
      this.dbMigrateFunction = new lambdaNodejs.NodejsFunction(this, 'DbMigrateFunction', {
        ...commonLambdaConfig,
        ...vpcConfig,
        handler: 'handler',
        entry: path.resolve(__dirname, '../../src/migrations/run-schema.ts'),
        environment: {
          SECRET_ARN: props.databaseStack!.database.secret!.secretArn,
          DB_HOST: props.databaseStack!.database.instanceEndpoint.hostname,
          DB_NAME: 'cira_invoice'
        },
        timeout: cdk.Duration.minutes(5),
        memorySize: 256
      });
    }

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
    const jobResultResource = jobByIdResource.addResource('result');

    jobsResource.addMethod('POST', lambdaIntegration, { apiKeyRequired: true });
    jobByIdResource.addMethod('GET', lambdaIntegration, { apiKeyRequired: true });
    jobStatusResource.addMethod('GET', lambdaIntegration, { apiKeyRequired: true });
    jobOcrResource.addMethod('GET', lambdaIntegration, { apiKeyRequired: true });
    jobResultResource.addMethod('GET', lambdaIntegration, { apiKeyRequired: true });

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

    // Only output DB migration function ARN when using RDS
    if (this.dbMigrateFunction) {
      new cdk.CfnOutput(this, 'DbMigrateFunctionArn', {
        value: this.dbMigrateFunction.functionArn,
        description: 'DB Migration Lambda Function ARN (invoke once post-deploy)'
      });
    }
  }
}
