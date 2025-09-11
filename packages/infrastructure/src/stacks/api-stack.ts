import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';

export interface ApiStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
  database: any; // Will be properly typed when database stack is implemented
}

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // TODO: Implement API Gateway and Lambda functions
    // This is a placeholder implementation for the project setup story
    
    new cdk.CfnOutput(this, 'ApiStackStatus', {
      value: 'API Stack created successfully',
      description: 'Status of the API stack creation'
    });
  }
}