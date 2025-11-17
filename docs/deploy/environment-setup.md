# Environment Setup Guide

This guide explains how to configure environment variables for the CIRA Invoice AWS system across different environments.

## Table of Contents

- [Environment Variables Overview](#environment-variables-overview)
- [Development Environment](#development-environment)
- [Staging Environment](#staging-environment)
- [Production Environment](#production-environment)
- [Secrets Management](#secrets-management)
- [Validation](#validation)

## Environment Variables Overview

The system uses environment variables to configure:
- AWS credentials and region
- Database connections
- API keys for external services
- Application behavior
- Deployment settings

### Configuration Files

```
.env                    # Active configuration (not in git)
.env.template           # Base template
.env.dev.template       # Development template
.env.staging.template   # Staging template
.env.production.template # Production template
```

### Environment Variable Categories

| Category | Variables | Purpose |
|----------|-----------|---------|
| AWS | `AWS_REGION`, `AWS_PROFILE` | AWS configuration |
| CDK | `CDK_DEFAULT_ACCOUNT`, `CDK_DEFAULT_REGION` | CDK deployment |
| Database | `USE_EXTERNAL_DATABASE`, `DATABASE_URL` | Database connection |
| Azure AI | `AZURE_API_KEY`, `AZURE_API_ENDPOINT`, `AZURE_MODEL` | LLM integration (Mistral Small) |
| Mistral | `MISTRAL_API_KEY` | OCR integration (optional) |
| Application | `NODE_ENV`, `LOG_LEVEL` | Runtime behavior |
| Deployment | `ENABLE_DELETION_PROTECTION`, `LOG_RETENTION_DAYS` | Infrastructure settings |

## Development Environment

Development environment setup for local testing.

### Quick Setup

```bash
# Copy template
cp .env.dev.template .env

# Edit file
nano .env  # or use your preferred editor
```

### Required Variables

#### AWS Configuration
```bash
# AWS region for deployment
AWS_REGION=us-east-1

# AWS profile to use (default or custom)
AWS_PROFILE=default

# Your AWS account ID (auto-detected if not set)
CDK_DEFAULT_ACCOUNT=123456789012

# CDK deployment region
CDK_DEFAULT_REGION=us-east-1
```

#### Database Configuration
```bash
# Use external database
USE_EXTERNAL_DATABASE=true

# PostgreSQL connection string
DATABASE_URL=postgresql://user:password@host:port/database
```

#### Azure AI Configuration (Mistral Small)
```bash
# Azure AI API key
# Get from: Azure Portal > Your AI Resource > Keys and Endpoint
AZURE_API_KEY=1234567890abcdef1234567890abcdef

# Azure AI endpoint
AZURE_API_ENDPOINT=https://your-resource.services.ai.azure.com/models

# Model deployment name
AZURE_MODEL=mistral-small-2503
```

**Finding your Azure AI credentials:**
1. Log in to [Azure Portal](https://portal.azure.com)
2. Navigate to your Azure AI resource
3. Go to **Keys and Endpoint**
4. Copy **KEY 1** (or KEY 2)
5. Copy **Endpoint** URL

#### Optional: Mistral Configuration
```bash
# Mistral API key (for OCR)
# Get from: https://console.mistral.ai/
MISTRAL_API_KEY=your-mistral-api-key
```

#### Application Settings
```bash
# Node environment
NODE_ENV=development

# Log level (error, warn, info, debug)
LOG_LEVEL=debug
```

#### Deployment Settings
```bash
# Stack name prefix
STACK_PREFIX=CiraInvoice

# Deletion protection (false for dev)
ENABLE_DELETION_PROTECTION=false

# CloudWatch log retention
LOG_RETENTION_DAYS=7
```

### Complete Development .env Example

```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_PROFILE=default
CDK_DEFAULT_ACCOUNT=123456789012
CDK_DEFAULT_REGION=us-east-1

# Database
USE_EXTERNAL_DATABASE=true
DATABASE_URL=postgresql://user:password@host:port/database

# Azure AI (Mistral Small)
AZURE_API_KEY=abc123def456ghi789jkl012mno345pqr
AZURE_API_ENDPOINT=https://my-resource.services.ai.azure.com/models
AZURE_MODEL=mistral-small-2503

# Optional: Mistral (for OCR)
MISTRAL_API_KEY=your-mistral-key-here

# Application
NODE_ENV=development
LOG_LEVEL=debug

# Deployment
STACK_PREFIX=CiraInvoice
ENABLE_DELETION_PROTECTION=false
LOG_RETENTION_DAYS=7
```

## Staging Environment

Staging uses AWS RDS for production-like testing.

### Quick Setup

```bash
cp .env.staging.template .env
nano .env
```

### Key Differences from Development

#### Database Configuration (RDS)
```bash
# Use AWS RDS
USE_EXTERNAL_DATABASE=false

# DATABASE_URL will be auto-retrieved from Secrets Manager
# Leave empty or commented out
# DATABASE_URL=
```

#### RDS Configuration
```bash
# RDS instance class
DB_INSTANCE_CLASS=db.t3.small

# Storage (GB)
DB_ALLOCATED_STORAGE=50

# Multi-AZ (false for staging to save costs)
DB_MULTI_AZ=false

# Backup retention (days)
DB_BACKUP_RETENTION_DAYS=14
```

#### Application Settings
```bash
NODE_ENV=staging
LOG_LEVEL=info
LOG_RETENTION_DAYS=14
```

#### Security Settings
```bash
# Enable deletion protection
ENABLE_DELETION_PROTECTION=true
```

### Complete Staging .env Example

```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_PROFILE=default
CDK_DEFAULT_ACCOUNT=123456789012
CDK_DEFAULT_REGION=us-east-1

# Database (RDS)
USE_EXTERNAL_DATABASE=false

# RDS Configuration
DB_INSTANCE_CLASS=db.t3.small
DB_ALLOCATED_STORAGE=50
DB_MULTI_AZ=false
DB_BACKUP_RETENTION_DAYS=14

# Azure AI (Consider using Secrets Manager)
AZURE_API_KEY=abc123def456ghi789jkl012mno345pqr
AZURE_API_ENDPOINT=https://my-resource.services.ai.azure.com/models
AZURE_MODEL=mistral-small-2503

# Optional: Mistral (for OCR)
MISTRAL_API_KEY=your-mistral-key-here

# Application
NODE_ENV=staging
LOG_LEVEL=info

# Deployment
STACK_PREFIX=CiraInvoice
ENABLE_DELETION_PROTECTION=true
LOG_RETENTION_DAYS=14
```

## Production Environment

Production uses AWS RDS with Multi-AZ for high availability.

### Quick Setup

```bash
cp .env.production.template .env
nano .env
```

### Production-Specific Configuration

#### AWS Profile
```bash
# Use dedicated production AWS profile
AWS_PROFILE=production

# Or use separate AWS account
CDK_DEFAULT_ACCOUNT=987654321098
```

#### Database Configuration
```bash
# Use RDS
USE_EXTERNAL_DATABASE=false

# High-performance instance
DB_INSTANCE_CLASS=db.r5.large

# Larger storage
DB_ALLOCATED_STORAGE=100

# Multi-AZ for high availability
DB_MULTI_AZ=true

# Extended backup retention
DB_BACKUP_RETENTION_DAYS=30
```

#### Security Configuration
```bash
# Must be enabled for production
ENABLE_DELETION_PROTECTION=true

# Enable enhanced monitoring
ENABLE_ENHANCED_MONITORING=true

# Enable CloudTrail
ENABLE_CLOUDTRAIL=true

# Enable VPC Flow Logs
ENABLE_VPC_FLOW_LOGS=true
```

#### Application Settings
```bash
NODE_ENV=production
LOG_LEVEL=warn
LOG_RETENTION_DAYS=30
```

### Complete Production .env Example

```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_PROFILE=production
CDK_DEFAULT_ACCOUNT=987654321098
CDK_DEFAULT_REGION=us-east-1

# Database (RDS Multi-AZ)
USE_EXTERNAL_DATABASE=false

# RDS Configuration (Production)
DB_INSTANCE_CLASS=db.r5.large
DB_ALLOCATED_STORAGE=100
DB_MULTI_AZ=true
DB_BACKUP_RETENTION_DAYS=30

# Azure AI (USE SECRETS MANAGER!)
# These should be empty in .env file
# Store in AWS Secrets Manager instead
AZURE_API_KEY=
AZURE_API_ENDPOINT=
AZURE_MODEL=mistral-small-2503

# Application
NODE_ENV=production
LOG_LEVEL=warn

# Deployment
STACK_PREFIX=CiraInvoice
ENABLE_DELETION_PROTECTION=true
LOG_RETENTION_DAYS=30

# Security
ENABLE_ENHANCED_MONITORING=true
ENABLE_CLOUDTRAIL=true
ENABLE_VPC_FLOW_LOGS=true

# Alerts
SNS_ALERT_TOPIC_ARN=arn:aws:sns:us-east-1:987654321098:cira-invoice-alerts
```

## Secrets Management

### Development: .env Files

For development, storing secrets in `.env` files is acceptable:

```bash
# .env file
AZURE_API_KEY=your-dev-key
```

**Important**: Never commit `.env` files to git!

### Production: AWS Secrets Manager

For production, use AWS Secrets Manager:

#### 1. Create Secrets

```bash
# Azure AI credentials (Mistral Small)
aws secretsmanager create-secret \
  --name cira-invoice/prod/azure-ai \
  --description "Azure AI credentials for production" \
  --secret-string '{
    "api_key": "your-production-key",
    "endpoint": "https://your-resource.services.ai.azure.com/models",
    "model": "mistral-small-2503"
  }'

# Mistral API key (for OCR)
aws secretsmanager create-secret \
  --name cira-invoice/prod/mistral \
  --description "Mistral API key for OCR in production" \
  --secret-string "your-mistral-key"
```

#### 2. Grant Lambda Access

The CDK infrastructure automatically grants Lambda functions access to secrets in the same account.

#### 3. Reference Secrets

In your .env file:
```bash
# Leave empty - Lambda will retrieve from Secrets Manager
AZURE_API_KEY=
AZURE_API_ENDPOINT=
AZURE_MODEL=mistral-small-2503
```

### Alternative: AWS Systems Manager Parameter Store

For non-sensitive configuration:

```bash
# Store configuration
aws ssm put-parameter \
  --name /cira-invoice/prod/log-level \
  --value "warn" \
  --type String

# Retrieve in Lambda
aws ssm get-parameter --name /cira-invoice/prod/log-level
```

## Validation

### Validate Environment Variables

Run the validation script:

```bash
./scripts/deploy/validate-env.sh dev
```

### Manual Validation Checklist

- [ ] All required variables are set
- [ ] URLs are properly formatted (https://)
- [ ] API keys are not empty or placeholder values
- [ ] Database URL is valid
- [ ] AWS account ID is correct
- [ ] Environment matches intended deployment (dev/staging/prod)

### Common Validation Errors

**Error: "AZURE_API_KEY is not set"**
```bash
# Solution: Add to .env
AZURE_API_KEY=your-key-here
```

**Error: "DATABASE_URL must start with postgresql://"**
```bash
# Solution: Ensure correct format
DATABASE_URL=postgresql://user:pass@host:port/db
```

**Error: "Multi-AZ must be enabled for production"**
```bash
# Solution: Update .env
DB_MULTI_AZ=true
```

## Environment Switching

### Switching Between Environments

```bash
# Switch to staging
cp .env.staging .env

# Validate
./scripts/deploy/validate-env.sh staging

# Deploy
./scripts/deploy/deploy.sh staging
```

### Managing Multiple Environments

Keep environment-specific files:

```bash
.env.dev      # Current dev config
.env.staging  # Current staging config
.env.prod     # Current prod config (minimal, uses Secrets Manager)

# Switch as needed
cp .env.staging .env
```

## Best Practices

### Security
1. **Never commit** `.env` files to version control
2. **Use Secrets Manager** for production
3. **Rotate keys** regularly
4. **Limit IAM permissions** to minimum required
5. **Enable MFA** for AWS accounts

### Organization
1. **Use templates** for consistency
2. **Document custom variables**
3. **Validate before deployment**
4. **Keep environment configs separate**

### Cost Management
1. **Right-size RDS** instances
2. **Enable deletion protection** for production
3. **Monitor usage** regularly

## Troubleshooting

### Issue: Variables Not Loading

```bash
# Check file exists
ls -la .env

# Check format (no spaces around =)
cat .env

# Export manually
export $(cat .env | grep -v '^#' | xargs)
```

### Issue: Secrets Not Accessible

```bash
# Check secret exists
aws secretsmanager describe-secret --secret-id cira-invoice/prod/azure-ai

# Check IAM permissions
aws iam get-role-policy --role-name CiraInvoiceLambdaRole --policy-name SecretsManagerAccess
```

### Issue: Wrong Environment Deployed

```bash
# Verify current config
grep NODE_ENV .env

# Check deployment config
cat deployment-dev.config
```

## Interactive Setup Script

For guided setup, use the interactive script:

```bash
./scripts/deploy/setup-environment.sh

# Follow prompts:
# - Select environment (dev/staging/prod)
# - Enter AWS credentials
# - Enter Azure OpenAI credentials
# - Configure database
```

## Next Steps

After configuring your environment:

1. [Validate setup](prerequisites.md#validation-checklist)
2. [Deploy to your environment](deployment-guide.md)
3. [Verify deployment](deployment-guide.md#post-deployment-verification)

## References

- [AWS Secrets Manager Documentation](https://docs.aws.amazon.com/secretsmanager/)
- [Environment Variables Best Practices](https://12factor.net/config)
- [AWS Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html)
