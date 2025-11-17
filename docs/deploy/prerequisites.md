# Prerequisites

Before deploying the CIRA Invoice AWS system, ensure you have all the required tools, accounts, and permissions.

## Required Accounts

### AWS Account
- **AWS Account** with administrative access
- **Account ID** ready for CDK bootstrap
- **Billing alerts** configured (recommended)

### Azure Account
- **Azure AI** service provisioned
- **API key** and **endpoint URL** available
- **Mistral Small** deployment created

## Required Tools

### Node.js and npm
```bash
# Required versions
Node.js: >= 20.17.0
npm: >= 10.0.0

# Check versions
node -v
npm -v

# Install Node.js
# Visit: https://nodejs.org/
# Or use nvm: https://github.com/nvm-sh/nvm
```

### AWS CLI
```bash
# Version 2.x required
aws --version

# Install AWS CLI v2
# Visit: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html

# Configure AWS CLI
aws configure
# Enter:
#   - AWS Access Key ID
#   - AWS Secret Access Key
#   - Default region (e.g., us-east-1)
#   - Default output format (json)
```

### AWS CDK
```bash
# Install globally
npm install -g aws-cdk

# Verify installation
cdk --version

# Should be version 2.x
```

### jq (JSON processor)
```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq

# Windows
# Download from: https://stedolan.github.io/jq/

# Verify
jq --version
```

### curl
```bash
# Usually pre-installed on macOS and Linux
# For Windows, install from: https://curl.se/

curl --version
```

## AWS Setup

### 1. IAM Permissions

Your AWS user/role needs the following permissions:

#### Required IAM Policies
- `CloudFormationFullAccess`
- `IAMFullAccess`
- `AmazonS3FullAccess`
- `AWSLambda_FullAccess`
- `AmazonAPIGatewayAdministrator`
- `AmazonRDSFullAccess` (for staging/production)
- `AmazonVPCFullAccess` (for staging/production)
- `CloudWatchFullAccess`
- `AWSStepFunctionsFullAccess`

#### Custom Policy for CDK
Create a custom policy with these permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "lambda:*",
        "apigateway:*",
        "iam:*",
        "s3:*",
        "ssm:*",
        "secretsmanager:*",
        "rds:*",
        "ec2:*",
        "logs:*",
        "states:*",
        "events:*",
        "sns:*",
        "cloudwatch:*"
      ],
      "Resource": "*"
    }
  ]
}
```

### 2. AWS CLI Configuration

```bash
# Configure AWS credentials
aws configure

# Test configuration
aws sts get-caller-identity

# Should return your account details
```

### 3. CDK Bootstrap

CDK must be bootstrapped in your AWS account and region:

```bash
# Get your AWS account ID
AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)

# Bootstrap CDK (one-time setup per account/region)
cdk bootstrap aws://${AWS_ACCOUNT}/us-east-1

# Verify bootstrap
aws cloudformation describe-stacks --stack-name CDKToolkit

# Should show CREATE_COMPLETE status
```

### 4. Service Quotas

Verify you have sufficient service limits:

```bash
# Check Lambda limits
aws service-quotas get-service-quota \
  --service-code lambda \
  --quota-code L-B99A9384

# Check RDS limits
aws service-quotas get-service-quota \
  --service-code rds \
  --quota-code L-952B80B8
```

**Minimum Required Limits:**
- Lambda: 1000 concurrent executions
- RDS: 40 DB instances
- VPC: 5 VPCs per region
- API Gateway: 10 API keys

## Azure AI Setup

### 1. Create Azure AI Resource

1. Log in to [Azure Portal](https://portal.azure.com)
2. Create a new **Azure AI** resource (AI Services)
3. Choose your preferred region
4. Note the **resource name** and **endpoint URL**

### 2. Deploy a Model

1. Navigate to your Azure AI resource
2. Go to **Model deployments**
3. Deploy **Mistral Small** (e.g., `mistral-small-2503`)
4. Note the **deployment name**

### 3. Get API Credentials

```bash
# Navigate to your resource in Azure Portal
# Go to: Keys and Endpoint

# You'll need:
AZURE_API_KEY=your-key-here
AZURE_API_ENDPOINT=https://your-resource.services.ai.azure.com/models
AZURE_MODEL=mistral-small-2503
```

## Project Setup

### 1. Clone Repository

```bash
git clone <repository-url>
cd cira_invoice_aws
```

### 2. Install Dependencies

```bash
# Install all packages
npm install

# Or use pnpm
pnpm install
```

### 3. Build Project

```bash
# Build all packages
npm run build

# Verify build
ls -la packages/*/dist
ls -la packages/infrastructure/lib
```

### 4. Environment Configuration

```bash
# Copy environment template
cp .env.dev.template .env

# Edit with your credentials
nano .env  # or use your preferred editor
```

Required environment variables:
```bash
# AWS
AWS_REGION=us-east-1
CDK_DEFAULT_ACCOUNT=your-account-id
CDK_DEFAULT_REGION=us-east-1

# Database
USE_EXTERNAL_DATABASE=true
DATABASE_URL=postgresql://...

# Azure AI (Mistral Small)
AZURE_API_KEY=your-key
AZURE_API_ENDPOINT=https://your-resource.services.ai.azure.com/models
AZURE_MODEL=mistral-small-2503

# Optional (for Mistral OCR provider)
MISTRAL_API_KEY=your-mistral-key
```

## Validation Checklist

Before proceeding with deployment, verify:

- [ ] AWS CLI installed and configured
- [ ] AWS account has required permissions
- [ ] CDK bootstrapped in target region
- [ ] Node.js >= 20.17.0 installed
- [ ] npm >= 10.0.0 installed
- [ ] jq installed (for scripts)
- [ ] Azure AI resource created
- [ ] Azure AI API key obtained
- [ ] Mistral Small model deployed in Azure
- [ ] Database connection string obtained
- [ ] Project dependencies installed
- [ ] Project builds successfully
- [ ] .env file created and configured

## Automated Validation

Run the validation script to check all prerequisites:

```bash
./scripts/deploy/validate-aws-setup.sh dev
```

This script will verify:
- Node.js and npm versions
- AWS CLI installation
- AWS credentials
- CDK installation and bootstrap
- Required environment variables
- IAM permissions (basic check)

## Estimated Setup Time

- **First-time setup**: 1-2 hours
- **Subsequent environments**: 15-30 minutes

## Common Setup Issues

### Issue: CDK Bootstrap Fails

```bash
# Error: Could not assume role...
# Solution: Ensure IAM permissions are correct

# Verify permissions
aws iam get-user
aws iam list-attached-user-policies --user-name YOUR_USERNAME
```

### Issue: Node Version Too Old

```bash
# Use nvm to install correct version
nvm install 20.17.0
nvm use 20.17.0
```

### Issue: AWS CLI Not Configured

```bash
# Configure with your credentials
aws configure

# Test connection
aws sts get-caller-identity
```

### Issue: Insufficient Permissions

```bash
# Check your permissions
aws iam get-user

# Contact AWS administrator to add required policies
```

## Next Steps

Once all prerequisites are met:

1. Review [Environment Setup](environment-setup.md)
2. Follow the [Deployment Guide](deployment-guide.md)
3. Test with [API documentation](../../api_usage.md)

## Support Resources

- **AWS Documentation**: https://docs.aws.amazon.com/
- **CDK Documentation**: https://docs.aws.amazon.com/cdk/
- **Azure AI**: https://azure.microsoft.com/en-us/products/ai-services
- **Mistral AI**: https://docs.mistral.ai/
- **Node.js**: https://nodejs.org/docs/

## Cost Considerations

Be aware of potential costs:

- **AWS Free Tier**: 1M Lambda requests/month (first 12 months)
- **Azure AI (Mistral)**: Pay-per-token pricing
- **RDS**: No free tier ($25-$350+/month depending on instance)
