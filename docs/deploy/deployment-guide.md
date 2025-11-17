# Deployment Guide

This guide provides step-by-step instructions for deploying the CIRA Invoice AWS system to different environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Deployment Overview](#deployment-overview)
- [Development Deployment (Supabase)](#development-deployment-supabase)
- [Staging Deployment (RDS)](#staging-deployment-rds)
- [Production Deployment (RDS Multi-AZ)](#production-deployment-rds-multi-az)
- [Post-Deployment Verification](#post-deployment-verification)
- [Updating Deployments](#updating-deployments)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before deploying, ensure you have completed all [prerequisites](prerequisites.md):

- ✅ AWS CLI configured
- ✅ CDK bootstrapped
- ✅ Azure OpenAI credentials
- ✅ Environment variables configured
- ✅ Project dependencies installed

## Deployment Overview

The deployment process consists of these main steps:

1. **Validation**: Check AWS setup and environment variables
2. **Database Deployment**: Deploy RDS (or configure Supabase for dev)
3. **Application Deployment**: Deploy API, Workflow, and Monitoring stacks
4. **Verification**: Run health checks and endpoint tests

### Deployment Architecture

```
┌──────────────────────┐
│   Validate Setup     │  ← Pre-flight checks
└──────────┬───────────┘
           │
┌──────────▼───────────┐
│  Deploy Database     │  ← RDS or Supabase
└──────────┬───────────┘
           │
┌──────────▼───────────┐
│  Deploy Application  │  ← API + Workflow + Monitoring
└──────────┬───────────┘
           │
┌──────────▼───────────┐
│  Verify Deployment   │  ← Health checks + Tests
└──────────────────────┘
```

## Development Deployment (Supabase)

Development environment uses Supabase for the database to minimize costs and setup time.

### Step 1: Configure Environment

```bash
# Copy development template
cp .env.dev.template .env

# Edit with your credentials
nano .env
```

Required variables:
```bash
USE_EXTERNAL_DATABASE=true
DATABASE_URL=postgresql://postgres.[project]:password@...supabase.co:6543/postgres
AZURE_OPENAI_API_KEY=your-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AWS_REGION=us-east-1
```

### Step 2: Initialize Supabase Database

```sql
-- Run this SQL in Supabase SQL Editor
-- Copy from: packages/database/schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE job_status AS ENUM ('queued', 'processing', 'completed', 'failed');
-- ... (rest of schema)
```

### Step 3: Validate Setup

```bash
# Run validation script
./scripts/deploy/validate-aws-setup.sh dev

# Should output: ✓ All checks passed!
```

### Step 4: Deploy to Development

```bash
# Run deployment script
./scripts/deploy/deploy.sh dev

# This will:
# 1. Validate AWS setup
# 2. Skip database deployment (using Supabase)
# 3. Deploy API, Workflow, and Monitoring stacks
# 4. Run health checks
```

Expected output:
```
╔════════════════════════════════════════════╗
║     CIRA Invoice AWS Deployment            ║
╚════════════════════════════════════════════╝

Environment: dev
Region: us-east-1

[1/5] Validating AWS Setup
✓ Validation passed

[2/5] Deploying Database Stack
⚠ Using external database (Supabase)
Skipping RDS deployment

[3/5] Deploying Application Stacks
✓ Application deployment completed

[4/5] Running Health Checks
✓ Health checks passed

[5/5] Deployment Summary
✓ Deployment completed successfully!

API Endpoint: https://xxx.execute-api.us-east-1.amazonaws.com/dev
```

### Step 5: Verify Deployment

```bash
# Quick health check
./scripts/deploy/health-check.sh dev

# Full verification
./scripts/deploy/verify-deployment.sh dev

# Test all endpoints
./scripts/deploy/test-endpoints.sh dev
```

### Step 6: Test API

```bash
# Get endpoint and API key from output
source deployment-dev.config

# Test health endpoint
curl $API_ENDPOINT/

# Submit test job
curl -X POST $API_ENDPOINT/jobs \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"pdf_url": "https://example.com/invoice.pdf"}'
```

### Development Deployment Time

- First deployment: ~5-10 minutes
- Subsequent updates: ~2-3 minutes

## Staging Deployment (RDS)

Staging environment uses AWS RDS for production-like testing.

### Step 1: Configure Environment

```bash
# Copy staging template
cp .env.staging.template .env

# Edit with your credentials
nano .env
```

Required variables:
```bash
USE_EXTERNAL_DATABASE=false  # Will use RDS
AZURE_OPENAI_API_KEY=your-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AWS_REGION=us-east-1

# RDS Configuration
DB_INSTANCE_CLASS=db.t3.small
DB_ALLOCATED_STORAGE=50
DB_MULTI_AZ=false
DB_BACKUP_RETENTION_DAYS=14
ENABLE_DELETION_PROTECTION=true
```

### Step 2: Validate Setup

```bash
./scripts/deploy/validate-aws-setup.sh staging
```

### Step 3: Deploy Database Stack

```bash
# Deploy database stack separately (recommended)
./scripts/deploy/deploy-database.sh staging

# This will:
# 1. Create VPC with public/private/isolated subnets
# 2. Deploy RDS PostgreSQL instance
# 3. Set up RDS Proxy for connection pooling
# 4. Create security groups
# 5. Run database migration
```

**Expected time**: 10-15 minutes (RDS creation is slow)

### Step 4: Deploy Application Stacks

```bash
# Deploy application stacks
./scripts/deploy/deploy-application.sh staging

# Or deploy everything at once:
./scripts/deploy/deploy.sh staging
```

### Step 5: Verify Deployment

```bash
# Comprehensive verification
./scripts/deploy/verify-deployment.sh staging

# Test endpoints
./scripts/deploy/test-endpoints.sh staging
```

### Step 6: Configure Monitoring

```bash
# Check CloudWatch dashboards
aws cloudwatch list-dashboards

# View alarms
aws cloudwatch describe-alarms --alarm-name-prefix CiraInvoice
```

### Staging Deployment Time

- First deployment: ~20-25 minutes (RDS takes time)
- Subsequent updates: ~5-8 minutes

## Production Deployment (RDS Multi-AZ)

Production deployment with high availability and enhanced security.

### Important: Production Checklist

Before deploying to production:

- [ ] All tests pass in staging
- [ ] Secrets stored in AWS Secrets Manager
- [ ] Deletion protection enabled
- [ ] Multi-AZ enabled for RDS
- [ ] CloudWatch alarms configured
- [ ] Backup retention set to 30 days
- [ ] SNS notifications configured
- [ ] Rollback plan documented
- [ ] Incident response plan ready

### Step 1: Configure Environment

```bash
# Copy production template
cp .env.production.template .env

# Edit with your credentials (use Secrets Manager for production!)
nano .env
```

Production configuration:
```bash
USE_EXTERNAL_DATABASE=false
NODE_ENV=production
AWS_PROFILE=production  # Use dedicated production profile

# RDS Configuration
DB_INSTANCE_CLASS=db.r5.large
DB_ALLOCATED_STORAGE=100
DB_MULTI_AZ=true  # ← High availability
DB_BACKUP_RETENTION_DAYS=30
ENABLE_DELETION_PROTECTION=true

# Security
ENABLE_CLOUDTRAIL=true
ENABLE_VPC_FLOW_LOGS=true
ENABLE_ENHANCED_MONITORING=true
```

### Step 2: Store Secrets in Secrets Manager

```bash
# Store Azure OpenAI credentials
aws secretsmanager create-secret \
  --name cira-invoice/prod/azure-openai \
  --secret-string '{
    "api_key":"your-azure-key",
    "endpoint":"your-azure-endpoint"
  }'

# Store Mistral API key
aws secretsmanager create-secret \
  --name cira-invoice/prod/mistral-api-key \
  --secret-string "your-mistral-key"
```

### Step 3: Validate Setup

```bash
./scripts/deploy/validate-aws-setup.sh prod

# Review output carefully
```

### Step 4: Deploy with Confirmation

```bash
# Deploy to production
./scripts/deploy/deploy.sh prod

# You will be prompted:
# ⚠ WARNING: You are deploying to PRODUCTION
# Are you sure you want to continue? Type 'yes' to confirm:
```

### Step 5: Monitor Deployment

```bash
# In another terminal, monitor logs
aws logs tail /aws/lambda/CiraInvoice-JobManagement-prod --follow

# Check stack status
watch -n 10 'aws cloudformation describe-stacks \
  --stack-name CiraInvoice-Api-prod \
  --query "Stacks[0].StackStatus"'
```

### Step 6: Verify Production Deployment

```bash
# Full verification
./scripts/deploy/verify-deployment.sh prod

# Manual checks
source deployment-prod.config

# Test health
curl $API_ENDPOINT/

# Check database
aws rds describe-db-instances \
  --db-instance-identifier cira-invoice-prod
```

### Step 7: Configure Alarms

```bash
# Set up SNS topic for alerts
aws sns create-topic --name cira-invoice-prod-alerts

# Subscribe to alerts
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:ACCOUNT:cira-invoice-prod-alerts \
  --protocol email \
  --notification-endpoint your-email@company.com
```

### Production Deployment Time

- First deployment: ~30-35 minutes (Multi-AZ RDS takes longer)
- Subsequent updates: ~10-15 minutes

## Post-Deployment Verification

After any deployment, verify these critical components:

### 1. API Health

```bash
curl https://your-endpoint/

# Expected response:
# {
#   "status": "healthy",
#   "version": "1.0.0",
#   "database": "connected"
# }
```

### 2. Lambda Functions

```bash
# Check all functions are active
aws lambda list-functions --query 'Functions[?contains(FunctionName, `CiraInvoice`)].[FunctionName,State]' --output table
```

### 3. Step Functions

```bash
# Check state machine
aws stepfunctions list-state-machines --query 'stateMachines[?contains(name, `CiraInvoice`)]'
```

### 4. Database Connectivity

```bash
# Check RDS status
aws rds describe-db-instances --db-instance-identifier cira-invoice-${ENVIRONMENT}

# Test connection from Lambda
aws lambda invoke \
  --function-name CiraInvoice-JobManagement-${ENVIRONMENT} \
  --payload '{"test":"connection"}' \
  response.json
```

### 5. CloudWatch Logs

```bash
# Check recent logs
aws logs tail /aws/lambda/CiraInvoice-JobManagement-${ENVIRONMENT} --since 5m
```

### 6. End-to-End Test

```bash
# Run full endpoint test
./scripts/deploy/test-endpoints.sh ${ENVIRONMENT}
```

## Updating Deployments

### Minor Updates (Code Changes)

```bash
# Build updated code
npm run build

# Deploy application stacks only
./scripts/deploy/deploy-application.sh ${ENVIRONMENT}

# Or use npm script
cd packages/infrastructure
npm run deploy:full:${ENVIRONMENT}
```

### Infrastructure Changes

```bash
# Full redeployment
./scripts/deploy/deploy.sh ${ENVIRONMENT}
```

### Database Schema Changes

```bash
# 1. Update schema in packages/database/schema.sql

# 2. Generate migration
cd packages/database
npm run db:generate

# 3. Deploy database stack
cd ../..
./scripts/deploy/deploy-database.sh ${ENVIRONMENT}
```

## Deployment Outputs

After deployment, you'll find these files:

```
deployment-{environment}.config  # Deployment configuration
outputs-api-{environment}.json   # API stack outputs
outputs-workflow-{environment}.json  # Workflow stack outputs
outputs-database-{environment}.json  # Database stack outputs (if RDS)
verification-{environment}-{timestamp}.txt  # Verification report
```

## Monitoring Deployments

### CloudFormation Events

```bash
# Watch stack events
aws cloudformation describe-stack-events \
  --stack-name CiraInvoice-Api-${ENVIRONMENT} \
  --max-items 10
```

### Lambda Metrics

```bash
# View invocation metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=CiraInvoice-JobManagement-${ENVIRONMENT} \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum
```

## Rollback Procedures

If deployment fails or issues arise:

```bash
# Automated rollback
./scripts/deploy/rollback.sh ${ENVIRONMENT}

# Manual rollback
aws cloudformation cancel-update-stack --stack-name CiraInvoice-Api-${ENVIRONMENT}
```

See [Rollback Procedures](rollback-procedures.md) for details.

## Troubleshooting

See [Troubleshooting Guide](troubleshooting.md) for common issues.

### Quick Fixes

**Issue: CDK deployment fails with "No stacks to deploy"**
```bash
# Rebuild infrastructure
cd packages/infrastructure
npm run build:app
```

**Issue: Lambda timeout**
```bash
# Increase timeout in infrastructure config
# Edit: packages/infrastructure/src/config/index.ts
```

**Issue: RDS connection fails**
```bash
# Check security groups
aws ec2 describe-security-groups --filters "Name=group-name,Values=*CiraInvoice*"

# Check RDS status
aws rds describe-db-instances
```

## Cost Optimization

- **Development**: Use Supabase (free tier)
- **Staging**: Use smallest RDS instance (db.t3.micro/small)
- **Production**: Right-size based on actual load
- **Off-hours**: Consider stopping dev/staging RDS instances

## Next Steps

After successful deployment:

1. Review [Monitoring Guide](monitoring.md)
2. Set up CloudWatch alarms
3. Configure backup verification
4. Document runbooks
5. Plan capacity scaling

## Support

For issues during deployment:

1. Check [Troubleshooting Guide](troubleshooting.md)
2. Review CloudWatch logs
3. Check CloudFormation events
4. Verify IAM permissions
5. Contact AWS support if needed
