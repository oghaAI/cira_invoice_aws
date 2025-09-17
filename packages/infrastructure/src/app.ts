#!/usr/bin/env node
/**
 * CIRA Invoice Processing System - CDK Application Entry Point
 *
 * This file orchestrates the deployment of the entire CIRA Invoice Processing System
 * infrastructure using AWS CDK. It creates and configures all necessary AWS resources
 * for a serverless invoice processing pipeline.
 *
 * Architecture Overview:
 * - 3-step workflow: PDF ingestion → OCR processing → LLM extraction
 * - PostgreSQL database for all data storage (no caching layer)
 * - Step Functions for workflow orchestration
 * - API Gateway + Lambda for REST API endpoints
 * - CloudWatch for monitoring and alerting
 *
 * Deployment Targets:
 * - dev: Development environment with minimal resources
 * - staging: Production-like environment for testing
 * - prod: Production environment with high availability
 *
 * Based on: docs/architecture-mvp.md
 * Requirements: Handle 3,000 invoices/day with 95% accuracy and 99.9% uptime
 */
import 'source-map-support/register';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as cdk from 'aws-cdk-lib';
import { ApiStack } from './stacks/api-stack';
import { DatabaseStack } from './stacks/database-stack';
import { WorkflowStack } from './stacks/workflow-stack';
import { MonitoringStack } from './stacks/monitoring-stack';
import { getConfig } from './config';

// Load environment variables from project root .env file
// These variables are used to configure Lambda functions with external service credentials
// (e.g., Azure OpenAI API keys, OCR service endpoints)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const app = new cdk.App();

// Get deployment environment from CDK context or default to 'dev'
// Usage: cdk deploy --context environment=prod
const environment = app.node.tryGetContext('environment') || 'dev';
const config = getConfig(environment);

// Common properties applied to all stacks for consistent tagging and organization
const baseProps = {
  tags: {
    Environment: environment,           // Environment identifier for resource organization
    Project: 'cira-invoice-aws',       // Project identifier for cost tracking
    ManagedBy: 'cdk'                   // Indicates infrastructure is managed by CDK
  }
};

// AWS account and region configuration
// CDK_DEFAULT_ACCOUNT and CDK_DEFAULT_REGION are set by CDK CLI or CI/CD pipeline
const envConfig = process.env['CDK_DEFAULT_ACCOUNT']
  ? {
      env: {
        account: process.env['CDK_DEFAULT_ACCOUNT'],
        region: process.env['CDK_DEFAULT_REGION'] || 'us-east-1'  // Default to us-east-1 per architecture
      }
    }
  : {};

// Combined stack properties used by all infrastructure stacks
const stackProps: cdk.StackProps = {
  ...baseProps,
  ...envConfig
};

// ============================================================================
// INFRASTRUCTURE STACK CREATION AND DEPENDENCY MANAGEMENT
// ============================================================================

// 1. Database Stack (Foundation Layer)
// Creates PostgreSQL RDS instance, VPC, security groups, and RDS Proxy
// This stack is the foundation and must be deployed first
const databaseStack = new DatabaseStack(app, `CiraInvoice-Database-${environment}`, {
  ...stackProps,
  config
});

// 2. API Stack (Application Layer)
// Creates Lambda functions, API Gateway, IAM roles, and API endpoints
// Depends on database stack for VPC and database connection details
const apiStack = new ApiStack(app, `CiraInvoice-Api-${environment}`, {
  ...stackProps,
  config,
  databaseStack
});

// 3. Workflow Stack (Orchestration Layer)
// Creates Step Functions state machine for invoice processing workflow
// Depends on both database and API stacks for Lambda function references
const workflowStack = new WorkflowStack(app, `CiraInvoice-Workflow-${environment}`, {
  ...stackProps,
  config,
  databaseStack,
  apiStack
});

// 4. Monitoring Stack (Observability Layer)
// Creates CloudWatch dashboards, alarms, log groups, and SNS topics
// Depends on all other stacks to monitor their resources
const monitoringStack = new MonitoringStack(app, `CiraInvoice-Monitoring-${environment}`, {
  ...stackProps,
  config,
  apiStack,
  databaseStack,
  workflowStack
});

// ============================================================================
// STACK DEPENDENCY DECLARATIONS
// ============================================================================
// Explicit dependency declarations ensure proper deployment order and
// prevent CloudFormation circular dependency errors

apiStack.addDependency(databaseStack);           // API needs database VPC and endpoints
workflowStack.addDependency(databaseStack);      // Workflow needs database for Lambda env vars
workflowStack.addDependency(apiStack);           // Workflow needs Lambda functions for state machine
monitoringStack.addDependency(apiStack);         // Monitoring needs API resources to monitor
monitoringStack.addDependency(workflowStack);    // Monitoring needs workflow resources to monitor
