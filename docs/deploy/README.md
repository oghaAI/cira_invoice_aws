# CIRA Invoice AWS - Deployment Guide

Welcome to the CIRA Invoice AWS deployment documentation. This guide will help you deploy the invoice processing system to AWS.

## Quick Start

```bash
# 1. Set up your environment
cp .env.dev.template .env
# Edit .env with your credentials

# 2. Validate your AWS setup
./scripts/deploy/validate-aws-setup.sh dev

# 3. Deploy to development
./scripts/deploy/deploy.sh dev

# 4. Verify deployment
./scripts/deploy/verify-deployment.sh dev
```

## What's Deployed?

The CIRA Invoice system deploys a complete serverless invoice processing pipeline on AWS:

- **API Stack**: Lambda functions + API Gateway for REST endpoints
- **Workflow Stack**: Step Functions for orchestrating the processing pipeline
- **Monitoring Stack**: CloudWatch dashboards and alarms
- **Database Stack**: PostgreSQL RDS with VPC (staging/production only)

## Documentation Overview

📚 **Start Here:**
- [Prerequisites](prerequisites.md) - What you need before deploying
- [Environment Setup](environment-setup.md) - Configuring environment variables

🚀 **Deployment:**
- [Deployment Guide](deployment-guide.md) - Step-by-step deployment instructions

🔧 **Operations:**
- [Rollback Procedures](rollback-procedures.md) - How to rollback deployments
- [Troubleshooting](troubleshooting.md) - Common issues and solutions

📊 **Monitoring:**
- [Monitoring](monitoring.md) - CloudWatch dashboards and alarms

🗄️ **Database:**
- [Database Migration](database-migration.md) - Database migration procedures

## Environments

The system supports three environments, each with different configurations:

### Development
- **Database**: External PostgreSQL
- **Purpose**: Local development and testing
- **Configuration**: `.env.dev.template`
- **Deletion Protection**: Disabled

### Staging
- **Database**: AWS RDS (db.t3.small)
- **Purpose**: Pre-production testing
- **Configuration**: `.env.staging.template`
- **Deletion Protection**: Enabled
- **Log Retention**: 14 days

### Production
- **Database**: AWS RDS (db.r5.large, Multi-AZ)
- **Purpose**: Production workloads
- **Configuration**: `.env.production.template`
- **Deletion Protection**: Enabled
- **Log Retention**: 30 days
- **Multi-AZ**: Enabled for high availability

## Common Workflows

### First-Time Deployment

```bash
# 1. Install prerequisites
npm install

# 2. Configure environment
cp .env.staging.template .env
# Edit .env

# 3. Validate setup
./scripts/deploy/validate-aws-setup.sh staging

# 4. Deploy
./scripts/deploy/deploy.sh staging

# 5. Verify
./scripts/deploy/verify-deployment.sh staging
```

### Updating Existing Deployment

```bash
# Quick update
cd packages/infrastructure
npm run deploy:full:staging

# Or use the main script
./scripts/deploy/deploy.sh staging --skip-validation
```

### Testing API

```bash
# Quick health check
./scripts/deploy/health-check.sh staging

# Full endpoint tests
./scripts/deploy/test-endpoints.sh staging
```

### Rollback

```bash
# Automated rollback
./scripts/deploy/rollback.sh staging
```

## Deployment Scripts

All deployment scripts are located in `scripts/deploy/`:

| Script | Purpose |
|--------|---------|
| `deploy.sh` | Main deployment orchestrator |
| `validate-aws-setup.sh` | Pre-deployment validation |
| `deploy-database.sh` | Database stack deployment |
| `deploy-application.sh` | Application stacks deployment |
| `health-check.sh` | Quick health verification |
| `test-endpoints.sh` | API endpoint testing |
| `verify-deployment.sh` | Comprehensive verification |
| `validate-env.sh` | Environment variable validation |
| `setup-environment.sh` | Interactive environment setup |
| `rollback.sh` | Automated rollback |

## Cost Estimates

Approximate monthly costs per environment:

### Development (External DB)
- API Gateway: ~$3.50 (1M requests)
- Lambda: ~$5.00 (100K executions)
- Step Functions: ~$0.25
- **Total**: ~$8-10/month

### Staging (RDS)
- API Gateway: ~$3.50
- Lambda: ~$10.00
- Step Functions: ~$0.50
- RDS (db.t3.small): ~$25.00
- Data Transfer: ~$5.00
- **Total**: ~$45-50/month

### Production (RDS Multi-AZ)
- API Gateway: ~$10.00
- Lambda: ~$30.00
- Step Functions: ~$2.00
- RDS (db.r5.large Multi-AZ): ~$350.00
- Data Transfer: ~$20.00
- CloudWatch: ~$10.00
- **Total**: ~$420-450/month

*Costs vary based on usage and data transfer*

## Security Best Practices

1. **Never commit secrets** to version control
2. **Use AWS Secrets Manager** for production credentials
3. **Enable MFA** for AWS console access
4. **Use IAM roles** for service-to-service authentication
5. **Review CloudWatch logs** regularly for security events
6. **Enable deletion protection** for production stacks
7. **Regularly rotate** API keys and credentials

## Support & Troubleshooting

- **Common Issues**: See [Troubleshooting Guide](troubleshooting.md)
- **CloudWatch Logs**: Check Lambda and Step Functions logs
- **Stack Status**: Monitor CloudFormation stacks in AWS console
- **API Documentation**: See [api_usage.md](../../api_usage.md) in project root

## Next Steps

1. Review [Prerequisites](prerequisites.md)
2. Follow the [Deployment Guide](deployment-guide.md)
3. Set up [Monitoring](monitoring.md)
4. Read [API Documentation](../../api_usage.md)

## Quick Reference

### Environment Variables
```bash
# Required for all environments
AZURE_API_KEY=your-key
AZURE_API_ENDPOINT=https://your-resource.services.ai.azure.com/models
AZURE_MODEL=mistral-small-2503
AWS_REGION=us-east-1

# For external database (dev)
USE_EXTERNAL_DATABASE=true
DATABASE_URL=postgresql://...

# For RDS (staging/prod)
USE_EXTERNAL_DATABASE=false
```

### Useful Commands

```bash
# View logs
aws logs tail /aws/lambda/CiraInvoice-JobManagement-dev --follow

# List executions
aws stepfunctions list-executions --state-machine-arn <arn>

# Check stack status
aws cloudformation describe-stacks --stack-name CiraInvoice-Api-dev

# Test API health
curl https://your-api-endpoint/
```

## Architecture Diagram

```
┌─────────────┐
│  Client App │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  API Gateway    │
│  + API Key Auth │
└────────┬────────┘
         │
         ▼
┌────────────────────────────┐
│     Lambda Functions       │
│  • Job Management          │
│  • OCR Processing          │
│  • LLM Extraction          │
└────────┬───────────────────┘
         │
         ▼
┌────────────────────────────┐
│   Step Functions           │
│   Processing Workflow      │
└────────┬───────────────────┘
         │
         ▼
┌────────────────────────────┐
│   PostgreSQL Database      │
│   • RDS (staging/prod)     │
│   • External DB (dev)      │
└────────────────────────────┘
```

---

For more detailed information, refer to the specific documentation pages linked above.
