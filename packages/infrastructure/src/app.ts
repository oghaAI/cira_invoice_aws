#!/usr/bin/env node
import 'source-map-support/register';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as cdk from 'aws-cdk-lib';
import { ApiStack } from './stacks/api-stack';
import { DatabaseStack } from './stacks/database-stack';
import { WorkflowStack } from './stacks/workflow-stack';
import { MonitoringStack } from './stacks/monitoring-stack';
import { getConfig } from './config';

// Load environment variables from project root .env so CDK can inject
// configuration into Lambda environments based on local settings.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const app = new cdk.App();

// Get environment from context or default to 'dev'
const environment = app.node.tryGetContext('environment') || 'dev';
const config = getConfig(environment);

// Common props for all stacks
const baseProps = {
  tags: {
    Environment: environment,
    Project: 'cira-invoice-aws',
    ManagedBy: 'cdk'
  }
};

const envConfig = process.env['CDK_DEFAULT_ACCOUNT']
  ? {
      env: {
        account: process.env['CDK_DEFAULT_ACCOUNT'],
        region: process.env['CDK_DEFAULT_REGION'] || 'us-east-1'
      }
    }
  : {};

const stackProps: cdk.StackProps = {
  ...baseProps,
  ...envConfig
};

// Database stack (foundational)
const databaseStack = new DatabaseStack(app, `CiraInvoice-Database-${environment}`, {
  ...stackProps,
  config
});

// API stack (depends on database)
const apiStack = new ApiStack(app, `CiraInvoice-Api-${environment}`, {
  ...stackProps,
  config,
  databaseStack
});

// Workflow stack (depends on database and API)
const workflowStack = new WorkflowStack(app, `CiraInvoice-Workflow-${environment}`, {
  ...stackProps,
  config,
  databaseStack,
  apiStack
});

// Monitoring stack (depends on all other stacks)
const monitoringStack = new MonitoringStack(app, `CiraInvoice-Monitoring-${environment}`, {
  ...stackProps,
  config,
  apiStack,
  databaseStack,
  workflowStack
});

// Add dependencies
apiStack.addDependency(databaseStack);
workflowStack.addDependency(databaseStack);
workflowStack.addDependency(apiStack);
monitoringStack.addDependency(apiStack);
monitoringStack.addDependency(workflowStack);
