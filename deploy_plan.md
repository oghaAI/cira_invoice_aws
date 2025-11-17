# CIRA Invoice AWS - Deployment Plan

## Overview

This document outlines the complete deployment infrastructure plan for the CIRA Invoice Processing system on AWS. The goal is to create a production-ready deployment pipeline that supports RDS (moving away from Supabase for staging/production).

## Task Groups & Checklist

### Task Group 1: Project Structure Setup
**Status**: ⏳ Pending | **Estimated Time**: 15 minutes

- [ ] Create `scripts/deploy/` directory structure
- [ ] Create `docs/deploy/` directory structure
- [ ] Create `.env.template` - Base environment template
- [ ] Create `.env.dev.template` - Development (Supabase) template
- [ ] Create `.env.staging.template` - Staging (RDS) template
- [ ] Create `.env.production.template` - Production (RDS) template

### Task Group 2: Core Deployment Scripts
**Status**: ⏳ Pending | **Estimated Time**: 2-3 hours | **Dependencies**: Group 1

- [ ] `scripts/deploy/validate-aws-setup.sh` - Pre-deployment validation
  - AWS credentials check
  - CDK bootstrap verification
  - IAM permissions check
  - Node.js/npm version validation
- [ ] `scripts/deploy/deploy-database.sh` - Database stack deployment
  - Deploy DatabaseStack via CDK
  - Wait for stack completion
  - Retrieve credentials from Secrets Manager
  - Run schema migration automatically
- [ ] `scripts/deploy/deploy-application.sh` - Application stacks deployment
  - Deploy API stack
  - Deploy Workflow stack
  - Deploy Monitoring stack
  - Output API endpoint and keys
- [ ] `scripts/deploy/deploy.sh` - Main orchestrator
  - Environment selection
  - Calls all deployment scripts in order
  - Progress indicators and colored output
  - Error handling

### Task Group 3: Verification & Testing Scripts
**Status**: ⏳ Pending | **Estimated Time**: 1-2 hours | **Dependencies**: Group 2

- [ ] `scripts/deploy/validate-env.sh` - Environment variable validation
  - Check all required variables
  - Validate formats (URLs, API keys)
  - Environment-specific validation
- [ ] `scripts/deploy/health-check.sh` - Quick health verification
  - API Gateway health endpoint test
  - Database connectivity check
  - Lambda function verification
- [ ] `scripts/deploy/test-endpoints.sh` - API endpoint testing
  - Test POST /jobs
  - Test GET /jobs/{id}/status
  - Test GET /jobs/{id}/result
  - Test GET /jobs/{id}/ocr
  - Generate test report
- [ ] `scripts/deploy/verify-deployment.sh` - Comprehensive verification
  - Run all health checks
  - Verify Step Functions state machine
  - Check CloudWatch logs
  - Validate RDS Proxy connection

### Task Group 4: Core Documentation
**Status**: ⏳ Pending | **Estimated Time**: 2-3 hours | **Dependencies**: Group 2

- [ ] `docs/deploy/README.md` - Quick start overview
  - Deployment process overview
  - Prerequisites checklist
  - Quick deployment commands
  - Common workflows
- [ ] `docs/deploy/prerequisites.md` - Detailed prerequisites
  - AWS account setup
  - IAM permissions required
  - CDK bootstrap instructions
  - Node.js and npm requirements
  - AWS CLI configuration
- [ ] `docs/deploy/deployment-guide.md` - Step-by-step deployment
  - First-time deployment walkthrough
  - Environment-specific deployments
  - Database and application stack deployment
  - Verification steps
- [ ] `docs/deploy/environment-setup.md` - Environment configuration
  - Required environment variables
  - AWS-specific configuration
  - Secrets management (Secrets Manager/SSM)
  - Database connection strings

### Task Group 5: Advanced Features
**Status**: ⏳ Pending | **Estimated Time**: 1-2 hours | **Dependencies**: Groups 2, 3, 4

- [ ] `scripts/deploy/setup-environment.sh` - Interactive environment setup
  - Guide user through variable configuration
  - Generate .env file from template
  - Validate configuration
- [ ] `scripts/deploy/rollback.sh` - Automated rollback
  - List available CDK stack versions
  - Rollback to previous version
  - Verify rollback success
- [ ] `docs/deploy/rollback-procedures.md` - Rollback documentation
  - When to rollback
  - Rollback strategies
  - Manual and automated steps
- [ ] `docs/deploy/troubleshooting.md` - Problem solving guide
  - Common deployment errors
  - CDK/VPC/Lambda issues
  - Database connectivity problems
  - IAM permission errors

### Task Group 6: Monitoring & Migration Documentation
**Status**: ⏳ Pending | **Estimated Time**: 1 hour | **Dependencies**: Group 4

- [ ] `docs/deploy/monitoring.md` - Monitoring and observability
  - CloudWatch dashboard overview
  - Available alarms and alerts
  - Log group locations
  - Metrics to monitor
  - SNS notification setup
- [ ] `docs/deploy/database-migration.md` - Supabase to RDS migration
  - Migration strategy
  - Data export from Supabase
  - Data import to RDS
  - Schema migration
  - Testing and rollback plan

### Task Group 7: API Documentation & Package Updates
**Status**: ⏳ Pending | **Estimated Time**: 30 minutes | **Dependencies**: All groups

- [ ] Update `api_usage.md` - Multi-environment support
  - Add environment-specific endpoints
  - Production API key generation
  - Environment-specific notes
  - Deployment reference links
- [ ] Update `packages/infrastructure/package.json` - New deployment scripts
  - Add `deploy:full:dev`, `deploy:full:staging`, `deploy:full:prod`
  - Add `deploy:db:*` commands
  - Add `verify:deployment`, `rollback:*` commands
- [ ] Final review and testing
  - Test all scripts
  - Review all documentation
  - Update this checklist

---

**Total Estimated Time**: 8-12 hours
**Current Progress**: 0/7 task groups completed

## Current State

### What We Have ✅
- **Complete RDS Infrastructure**: [database-stack.ts](packages/infrastructure/src/stacks/database-stack.ts) with VPC, RDS Proxy, security groups
- **Flexible Database Configuration**: Supports both Supabase (dev) and RDS (staging/prod) via `USE_EXTERNAL_DATABASE` flag
- **CDK Stacks**: 4 well-designed stacks (Database, API, Workflow, Monitoring)
- **Migration Scripts**: [migrate.sh](packages/infrastructure/scripts/migrate.sh) ready to run
- **Existing API Documentation**: [api_usage.md](api_usage.md) with comprehensive endpoint documentation
- **Environment Configurations**: Dev, staging, and prod configs in [config/index.ts](packages/infrastructure/src/config/index.ts)

### What's Missing ⚠️
- Deployment automation scripts
- Pre-deployment validation
- Comprehensive deployment documentation
- Environment setup helpers
- Post-deployment verification
- Rollback procedures

## Implementation Plan

### 1. Deployment Automation Scripts (`scripts/deploy/`)

#### Primary Scripts
- **`deploy.sh`** - Main deployment orchestrator
  - Environment selection (dev/staging/prod)
  - Calls validation, deployment, and verification scripts
  - Colored output and progress indicators
  - Error handling and rollback on failure

- **`validate-aws-setup.sh`** - Pre-deployment validation
  - Check AWS credentials (`aws sts get-caller-identity`)
  - Verify CDK bootstrap status
  - Check required IAM permissions
  - Validate Node.js and npm versions
  - Verify environment variables are set

- **`setup-environment.sh`** - Interactive environment configuration
  - Guide user through required environment variables
  - Generate `.env` file from template
  - Validate configuration
  - Support for dev/staging/prod environments

- **`deploy-database.sh`** - Database stack deployment
  - Deploy DatabaseStack with CDK
  - Wait for stack completion
  - Retrieve database credentials from Secrets Manager
  - Run schema migration automatically
  - Verify database connectivity

- **`deploy-application.sh`** - Application stack deployment
  - Deploy API stack
  - Deploy Workflow stack
  - Deploy Monitoring stack
  - Configure cross-stack dependencies
  - Output API endpoint and API key

#### Verification Scripts
- **`health-check.sh`** - Quick health check
  - Test API Gateway health endpoint
  - Check database connectivity
  - Verify Lambda functions are running

- **`verify-deployment.sh`** - Comprehensive verification
  - Run health checks
  - Test all API endpoints
  - Verify Step Functions state machine
  - Check CloudWatch logs
  - Validate RDS Proxy connection

- **`test-endpoints.sh`** - API endpoint testing
  - Test POST /jobs
  - Test GET /jobs/{id}/status
  - Test GET /jobs/{id}/result
  - Test GET /jobs/{id}/ocr
  - Generate test report

#### Rollback Scripts
- **`rollback.sh`** - Automated rollback
  - List available CDK stack versions
  - Rollback to previous version
  - Verify rollback success
  - Update DNS/routing if needed

#### Environment Validation
- **`validate-env.sh`** - Environment variable validation
  - Check all required variables are set
  - Validate format (URLs, API keys, etc.)
  - Check AWS-specific variables
  - Environment-specific validation (dev vs prod)

### 2. Deployment Documentation (`docs/deploy/`)

#### Core Documentation
- **`README.md`** - Quick start guide
  - Overview of deployment process
  - Prerequisites checklist
  - Quick deployment commands
  - Common workflows
  - Links to detailed guides

- **`prerequisites.md`** - Detailed prerequisites
  - AWS account setup
  - IAM permissions required
  - CDK bootstrap instructions
  - Node.js and npm requirements
  - Development tools needed
  - AWS CLI configuration

- **`deployment-guide.md`** - Step-by-step deployment
  - First-time deployment walkthrough
  - Environment-specific deployments
  - Database stack deployment
  - Application stack deployment
  - Verification steps
  - Common issues during deployment

- **`environment-setup.md`** - Environment configuration
  - Required environment variables
  - AWS-specific configuration
  - Database connection strings
  - API keys and secrets management
  - Using AWS Secrets Manager
  - Using AWS Systems Manager Parameter Store

- **`database-migration.md`** - Supabase to RDS migration
  - Why migrate to RDS
  - Migration strategy
  - Data export from Supabase
  - Data import to RDS
  - Schema migration
  - Testing migration
  - Rollback plan

- **`troubleshooting.md`** - Problem solving guide
  - Common deployment errors
  - CDK bootstrap issues
  - VPC and networking problems
  - Lambda timeout issues
  - RDS connectivity problems
  - API Gateway configuration
  - IAM permission errors
  - CloudFormation stack failures

- **`rollback-procedures.md`** - Rollback documentation
  - When to rollback
  - Rollback strategies
  - Manual rollback steps
  - Automated rollback using scripts
  - Database rollback considerations
  - Verification after rollback

- **`monitoring.md`** - Monitoring and observability
  - CloudWatch dashboard overview
  - Available alarms and alerts
  - Log group locations
  - Metrics to monitor
  - Setting up SNS notifications
  - Cost monitoring
  - Performance optimization

### 3. API Documentation Enhancement

#### Updates to `api_usage.md`
- Add multi-environment endpoint section
  ```markdown
  ## Environments

  ### Development
  - Endpoint: https://xxx.execute-api.us-east-1.amazonaws.com/dev
  - Database: Supabase

  ### Staging
  - Endpoint: https://xxx.execute-api.us-east-1.amazonaws.com/staging
  - Database: RDS PostgreSQL

  ### Production
  - Endpoint: https://xxx.execute-api.us-east-1.amazonaws.com/prod
  - Database: RDS PostgreSQL (Multi-AZ)
  ```

- Add API key generation instructions
  - How to create new API keys
  - Rotating API keys
  - API key best practices

- Add deployment references
  - Link to deployment documentation
  - Environment-specific notes
  - Rate limits per environment

### 4. Environment Configuration Templates

#### Template Files
- **`.env.template`** - Base template
  ```bash
  # AWS Configuration
  AWS_REGION=us-east-1
  AWS_PROFILE=default
  CDK_DEFAULT_ACCOUNT=
  CDK_DEFAULT_REGION=us-east-1

  # Database Configuration
  USE_EXTERNAL_DATABASE=false
  DATABASE_URL=

  # API Configuration
  AZURE_OPENAI_API_KEY=
  AZURE_OPENAI_ENDPOINT=
  ```

- **`.env.dev.template`** - Development (Supabase)
  ```bash
  USE_EXTERNAL_DATABASE=true
  DATABASE_URL=postgresql://...@...supabase.com:6543/postgres
  ```

- **`.env.staging.template`** - Staging (RDS)
  ```bash
  USE_EXTERNAL_DATABASE=false
  # DATABASE_URL will be set by Secrets Manager
  ```

- **`.env.production.template`** - Production (RDS)
  ```bash
  USE_EXTERNAL_DATABASE=false
  # All secrets from AWS Secrets Manager
  ```

### 5. Package.json Enhancements

#### New Scripts in `packages/infrastructure/package.json`
```json
{
  "scripts": {
    "deploy:full:dev": "npm run build:app && cdk deploy --all --context environment=dev",
    "deploy:full:staging": "npm run build:app && cdk deploy --all --context environment=staging",
    "deploy:full:prod": "npm run build:app && cdk deploy --all --context environment=prod --require-approval never",
    "deploy:db:dev": "npm run build:app && cdk deploy CiraInvoice-Database-dev --context environment=dev",
    "deploy:db:staging": "npm run build:app && cdk deploy CiraInvoice-Database-staging --context environment=staging",
    "deploy:db:prod": "npm run build:app && cdk deploy CiraInvoice-Database-prod --context environment=prod",
    "verify:deployment": "../../scripts/deploy/verify-deployment.sh",
    "rollback:dev": "../../scripts/deploy/rollback.sh dev",
    "rollback:staging": "../../scripts/deploy/rollback.sh staging",
    "rollback:prod": "../../scripts/deploy/rollback.sh prod"
  }
}
```

## Deployment Workflows

### First-Time Deployment to Staging

```bash
# 1. Validate AWS setup
./scripts/deploy/validate-aws-setup.sh staging

# 2. Set up environment
./scripts/deploy/setup-environment.sh staging

# 3. Deploy (automated)
./scripts/deploy/deploy.sh staging

# 4. Verify deployment
./scripts/deploy/verify-deployment.sh staging
```

### Updating Existing Deployment

```bash
# Quick deployment
cd packages/infrastructure
npm run deploy:full:staging

# Or use main script
./scripts/deploy/deploy.sh staging --skip-validation
```

### Rollback

```bash
# Automated rollback
./scripts/deploy/rollback.sh staging

# Or via npm
cd packages/infrastructure
npm run rollback:staging
```

## Implementation Priority

### Phase 1: Core Infrastructure (High Priority)
1. ✅ Create `scripts/deploy/` directory structure
2. ✅ Create `docs/deploy/` directory structure
3. ✅ Write `scripts/deploy/deploy.sh` - main orchestrator
4. ✅ Write `scripts/deploy/validate-aws-setup.sh`
5. ✅ Write `scripts/deploy/deploy-database.sh`
6. ✅ Write `scripts/deploy/deploy-application.sh`

### Phase 2: Documentation (High Priority)
1. ✅ Write `docs/deploy/README.md`
2. ✅ Write `docs/deploy/prerequisites.md`
3. ✅ Write `docs/deploy/deployment-guide.md`
4. ✅ Write `docs/deploy/environment-setup.md`
5. ✅ Update `api_usage.md` with multi-environment support

### Phase 3: Verification & Safety (Medium Priority)
1. ✅ Write `scripts/deploy/verify-deployment.sh`
2. ✅ Write `scripts/deploy/health-check.sh`
3. ✅ Write `scripts/deploy/test-endpoints.sh`
4. ✅ Write `docs/deploy/troubleshooting.md`

### Phase 4: Advanced Features (Medium Priority)
1. ✅ Write `scripts/deploy/rollback.sh`
2. ✅ Write `scripts/deploy/setup-environment.sh`
3. ✅ Write `docs/deploy/rollback-procedures.md`
4. ✅ Write `docs/deploy/monitoring.md`

### Phase 5: Migration Support (Lower Priority)
1. ✅ Write `docs/deploy/database-migration.md`
2. ✅ Create environment templates
3. ✅ Write `scripts/deploy/validate-env.sh`

## Success Criteria

### Must Have
- [ ] One-command deployment for each environment
- [ ] Pre-deployment validation catches common issues
- [ ] Successful database migration from Supabase to RDS
- [ ] All API endpoints verified post-deployment
- [ ] Clear documentation for first-time deployment
- [ ] Rollback capability tested and working

### Should Have
- [ ] Automated health checks post-deployment
- [ ] Comprehensive troubleshooting guide
- [ ] Environment templates for easy setup
- [ ] CloudWatch monitoring configured
- [ ] Cost estimation before deployment

### Nice to Have
- [ ] CI/CD pipeline templates
- [ ] Automated testing before deployment
- [ ] Deployment notifications (Slack, email)
- [ ] Performance benchmarking
- [ ] Blue-green deployment support

## Timeline Estimate

- **Phase 1 (Core Infrastructure)**: 2-3 hours
- **Phase 2 (Documentation)**: 2-3 hours
- **Phase 3 (Verification)**: 1-2 hours
- **Phase 4 (Advanced Features)**: 1-2 hours
- **Phase 5 (Migration Support)**: 1 hour

**Total Estimated Time**: 7-11 hours

## Testing Strategy

### Local Testing
1. Test scripts with dry-run mode
2. Validate bash script syntax
3. Test with invalid inputs
4. Test error handling

### Staging Deployment
1. Deploy to staging environment
2. Run full verification suite
3. Test rollback procedure
4. Verify monitoring and alarms

### Production Readiness
1. Review all documentation
2. Security audit of IAM permissions
3. Cost estimation
4. Backup and disaster recovery plan
5. Production deployment checklist

## Notes

- All scripts should be idempotent (can run multiple times safely)
- All scripts should have proper error handling
- All scripts should provide clear output and progress indicators
- All documentation should be kept up-to-date with infrastructure changes
- Environment-specific configuration should be externalized
- Secrets should never be committed to version control

## References

- CDK Documentation: https://docs.aws.amazon.com/cdk/
- AWS Lambda Best Practices: https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html
- RDS Best Practices: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_BestPractices.html
- Step Functions Best Practices: https://docs.aws.amazon.com/step-functions/latest/dg/best-practices.html
