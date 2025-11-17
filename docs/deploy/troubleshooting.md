# Troubleshooting Guide

Common issues and solutions for deploying and operating the CIRA Invoice AWS system.

## Table of Contents

- [Deployment Issues](#deployment-issues)
- [AWS & CDK Issues](#aws--cdk-issues)
- [Database Issues](#database-issues)
- [Lambda Issues](#lambda-issues)
- [API Gateway Issues](#api-gateway-issues)
- [Step Functions Issues](#step-functions-issues)
- [Networking & VPC Issues](#networking--vpc-issues)
- [Performance Issues](#performance-issues)

## Deployment Issues

### Issue: "CDK bootstrap failed"

**Symptoms**: `Error: This stack uses assets, so the toolkit stack must be deployed`

**Solution**:
```bash
# Bootstrap CDK in your account/region
export AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
cdk bootstrap aws://${AWS_ACCOUNT}/us-east-1

# Verify bootstrap
aws cloudformation describe-stacks --stack-name CDKToolkit
```

**Prevention**: Always bootstrap before first CDK deployment

---

### Issue: "No stacks to deploy"

**Symptoms**: CDK reports no changes to deploy

**Solutions**:
```bash
# 1. Rebuild infrastructure package
cd packages/infrastructure
npm run build:app

# 2. Force redeploy
cdk deploy --all --force

# 3. Check if stacks already exist
aws cloudformation list-stacks --query 'StackSummaries[?contains(StackName, `CiraInvoice`)]'
```

---

### Issue: "Rate exceeded" during deployment

**Symptoms**: `Rate exceeded` errors from CloudFormation

**Solution**:
```bash
# Wait and retry
sleep 60
./scripts/deploy/deploy.sh ${ENVIRONMENT}

# Or deploy stacks one at a time
./scripts/deploy/deploy-database.sh ${ENVIRONMENT}
sleep 30
./scripts/deploy/deploy-application.sh ${ENVIRONMENT}
```

**Prevention**: Deploy stacks sequentially rather than in parallel

---

### Issue: "Insufficient permissions"

**Symptoms**: `User: arn:aws:iam::xxx:user/xxx is not authorized to perform`

**Solution**:
```bash
# Check your current permissions
aws iam get-user

# Check attached policies
aws iam list-attached-user-policies --user-name YOUR_USERNAME

# Verify you have required policies:
# - CloudFormationFullAccess
# - IAMFullAccess
# - AWSLambda_FullAccess
# - AmazonAPIGatewayAdministrator
# - AmazonRDSFullAccess
# - AmazonVPCFullAccess
```

**Prevention**: Ensure proper IAM permissions before deployment

---

## AWS & CDK Issues

### Issue: "Node version too old"

**Symptoms**: `Error: Node.js version 18.x is not supported`

**Solution**:
```bash
# Check version
node -v

# Install correct version
nvm install 20.17.0
nvm use 20.17.0

# Verify
node -v  # Should be >= 20.17.0
```

---

### Issue: "CDK version mismatch"

**Symptoms**: `Cloud assembly schema version mismatch`

**Solution**:
```bash
# Reinstall CDK globally
npm uninstall -g aws-cdk
npm install -g aws-cdk@2.214.0

# Rebuild project
npm run build

# Verify versions match
cdk --version
cat packages/infrastructure/package.json | grep '"aws-cdk"'
```

---

### Issue: "AWS credentials not configured"

**Symptoms**: `Unable to locate credentials`

**Solution**:
```bash
# Configure AWS CLI
aws configure

# Or use environment variables
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
export AWS_REGION=us-east-1

# Test connection
aws sts get-caller-identity
```

---

## Database Issues

### Issue: "Database connection failed"

**Symptoms**: `error: connect ETIMEDOUT` or `ECONNREFUSED`

**Solutions**:

#### For Supabase:
```bash
# 1. Verify connection string
echo $DATABASE_URL

# 2. Test connection directly
psql $DATABASE_URL -c "SELECT 1"

# 3. Check Supabase project status
# Visit Supabase dashboard

# 4. Ensure using pooler URL (port 6543)
DATABASE_URL=postgresql://...@...pooler.supabase.co:6543/postgres
```

#### For RDS:
```bash
# 1. Check RDS status
aws rds describe-db-instances \
  --db-instance-identifier cira-invoice-${ENVIRONMENT}

# 2. Verify security groups
aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=*CiraInvoice*"

# 3. Check Lambda VPC configuration
aws lambda get-function-configuration \
  --function-name CiraInvoice-JobManagement-${ENVIRONMENT} \
  --query 'VpcConfig'

# 4. Test from Lambda
aws lambda invoke \
  --function-name CiraInvoice-JobManagement-${ENVIRONMENT} \
  --payload '{"action":"test-db"}' \
  response.json
```

---

### Issue: "Migration failed"

**Symptoms**: `Migration failed: relation "jobs" already exists`

**Solution**:
```bash
# 1. Check current schema
psql $DATABASE_URL -c "\dt"

# 2. Drop and recreate (DEV ONLY!)
psql $DATABASE_URL -c "DROP TABLE IF EXISTS jobs, job_results CASCADE"

# 3. Rerun migration
cd packages/infrastructure
./scripts/migrate.sh ${ENVIRONMENT}

# 4. Verify
psql $DATABASE_URL -c "\d jobs"
```

**Prevention**: Version control migrations properly

---

### Issue: "RDS instance stuck creating"

**Symptoms**: RDS in `creating` state for >20 minutes

**Solution**:
```bash
# 1. Check events
aws rds describe-events \
  --source-identifier cira-invoice-${ENVIRONMENT} \
  --duration 60

# 2. Check CloudFormation events
aws cloudformation describe-stack-events \
  --stack-name CiraInvoice-Database-${ENVIRONMENT} \
  --max-items 20

# 3. If truly stuck (>30 min), delete and retry
aws cloudformation delete-stack \
  --stack-name CiraInvoice-Database-${ENVIRONMENT}

# Wait for deletion
aws cloudformation wait stack-delete-complete \
  --stack-name CiraInvoice-Database-${ENVIRONMENT}

# Redeploy
./scripts/deploy/deploy-database.sh ${ENVIRONMENT}
```

---

## Lambda Issues

### Issue: "Lambda timeout"

**Symptoms**: `Task timed out after 30.00 seconds`

**Solutions**:
```bash
# 1. Increase timeout temporarily
aws lambda update-function-configuration \
  --function-name CiraInvoice-JobManagement-${ENVIRONMENT} \
  --timeout 60

# 2. Optimize code (longer term)
# - Reduce external API calls
# - Optimize database queries
# - Add connection pooling

# 3. Update infrastructure config permanently
# Edit: packages/infrastructure/src/config/index.ts
# Change: timeout: 30 → timeout: 60
```

---

### Issue: "Lambda out of memory"

**Symptoms**: `Runtime exited with error: signal: killed`

**Solution**:
```bash
# 1. Check memory usage
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name MemoryUtilization \
  --dimensions Name=FunctionName,Value=CiraInvoice-JobManagement-${ENVIRONMENT} \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Maximum

# 2. Increase memory
aws lambda update-function-configuration \
  --function-name CiraInvoice-JobManagement-${ENVIRONMENT} \
  --memory-size 1024

# 3. Update infrastructure config
# Edit: packages/infrastructure/src/config/index.ts
# Change: memorySize: 512 → memorySize: 1024
```

---

### Issue: "Cold start too slow"

**Symptoms**: First requests take >5 seconds

**Solutions**:
```bash
# 1. Enable provisioned concurrency
aws lambda put-provisioned-concurrency-config \
  --function-name CiraInvoice-JobManagement-${ENVIRONMENT} \
  --provisioned-concurrent-executions 2

# 2. Increase memory (faster CPU)
aws lambda update-function-configuration \
  --function-name CiraInvoice-JobManagement-${ENVIRONMENT} \
  --memory-size 1024

# 3. Use RDS Proxy (for database connections)
# Already implemented in infrastructure

# 4. Optimize bundle size
cd packages/api
npm run build -- --minify
```

---

### Issue: "Function not found"

**Symptoms**: `ResourceNotFoundException: Function not found`

**Solution**:
```bash
# 1. List Lambda functions
aws lambda list-functions \
  --query 'Functions[?contains(FunctionName, `CiraInvoice`)].[FunctionName]' \
  --output text

# 2. Check deployment status
aws cloudformation describe-stack-resources \
  --stack-name CiraInvoice-Api-${ENVIRONMENT} \
  --query 'StackResources[?ResourceType==`AWS::Lambda::Function`]'

# 3. Redeploy API stack
./scripts/deploy/deploy-application.sh ${ENVIRONMENT}
```

---

## API Gateway Issues

### Issue: "403 Forbidden"

**Symptoms**: `{"message":"Forbidden"}`

**Solutions**:
```bash
# 1. Check API key
source deployment-${ENVIRONMENT}.config
echo $API_KEY

# 2. Verify API key in request
curl -H "X-API-Key: $API_KEY" $API_ENDPOINT/

# 3. Check API Gateway configuration
aws apigateway get-api-keys --include-values

# 4. Regenerate API key if needed
# Redeploy API stack
./scripts/deploy/deploy-application.sh ${ENVIRONMENT}
```

---

### Issue: "API Gateway 5XX errors"

**Symptoms**: HTTP 500/502/503/504 responses

**Solutions**:
```bash
# 1. Check Lambda errors
aws logs tail /aws/lambda/CiraInvoice-JobManagement-${ENVIRONMENT} \
  --since 30m \
  --filter-pattern "ERROR"

# 2. Check API Gateway logs
aws logs tail /aws/apigateway/CiraInvoice-${ENVIRONMENT} \
  --since 30m

# 3. Test Lambda directly
aws lambda invoke \
  --function-name CiraInvoice-JobManagement-${ENVIRONMENT} \
  --payload '{"httpMethod":"GET","path":"/"}' \
  response.json

cat response.json

# 4. Check integration configuration
aws apigateway get-integration \
  --rest-api-id <API_ID> \
  --resource-id <RESOURCE_ID> \
  --http-method GET
```

---

### Issue: "CORS errors"

**Symptoms**: `Access to fetch at '...' has been blocked by CORS policy`

**Solution**:
```bash
# CORS is configured in the API stack
# Check handler returns proper CORS headers:

# Expected headers:
# Access-Control-Allow-Origin: *
# Access-Control-Allow-Methods: GET, POST, OPTIONS
# Access-Control-Allow-Headers: Content-Type, X-API-Key

# Test OPTIONS request
curl -X OPTIONS $API_ENDPOINT/jobs \
  -H "Origin: https://example.com" \
  -v
```

---

## Step Functions Issues

### Issue: "State machine execution failed"

**Symptoms**: Step Functions execution shows failed status

**Solutions**:
```bash
# 1. Get execution ARN
aws stepfunctions list-executions \
  --state-machine-arn $STATE_MACHINE_ARN \
  --status-filter FAILED \
  --max-results 5

# 2. Describe failed execution
aws stepfunctions describe-execution \
  --execution-arn <EXECUTION_ARN>

# 3. Get execution history
aws stepfunctions get-execution-history \
  --execution-arn <EXECUTION_ARN> \
  --query 'events[?type==`TaskFailed`]'

# 4. Check Lambda logs for the failed task
aws logs tail /aws/lambda/CiraInvoice-OcrProcessing-${ENVIRONMENT} \
  --since 1h \
  --filter-pattern "ERROR"
```

---

### Issue: "State machine not found"

**Symptoms**: `StateMachineDoesNotExist`

**Solution**:
```bash
# 1. List state machines
aws stepfunctions list-state-machines \
  --query 'stateMachines[?contains(name, `CiraInvoice`)]'

# 2. Check workflow stack
aws cloudformation describe-stack-resources \
  --stack-name CiraInvoice-Workflow-${ENVIRONMENT}

# 3. Redeploy workflow stack
cd packages/infrastructure
cdk deploy CiraInvoice-Workflow-${ENVIRONMENT} \
  --context environment=${ENVIRONMENT}
```

---

## Networking & VPC Issues

### Issue: "Lambda cannot reach internet"

**Symptoms**: `getaddrinfo ENOTFOUND` when calling external APIs

**Solution**:
```bash
# Lambda in VPC needs NAT Gateway for internet access

# 1. Check NAT Gateway exists
aws ec2 describe-nat-gateways \
  --filter "Name=tag:aws:cloudformation:stack-name,Values=CiraInvoice-Database-${ENVIRONMENT}"

# 2. Check route tables
aws ec2 describe-route-tables \
  --filters "Name=tag:aws:cloudformation:stack-name,Values=CiraInvoice-Database-${ENVIRONMENT}"

# 3. Verify Lambda is in private subnet (not public)
aws lambda get-function-configuration \
  --function-name CiraInvoice-JobManagement-${ENVIRONMENT} \
  --query 'VpcConfig.SubnetIds'

# 4. If NAT Gateway missing, redeploy database stack
./scripts/deploy/deploy-database.sh ${ENVIRONMENT}
```

---

### Issue: "Security group rules blocking traffic"

**Symptoms**: Connection timeouts to RDS

**Solution**:
```bash
# 1. Find security groups
aws ec2 describe-security-groups \
  --filters "Name=tag:aws:cloudformation:stack-name,Values=CiraInvoice-Database-${ENVIRONMENT}"

# 2. Check inbound rules for RDS security group
aws ec2 describe-security-groups \
  --group-ids <SG_ID> \
  --query 'SecurityGroups[0].IpPermissions'

# 3. Verify Lambda security group can reach RDS
# Should see rule allowing port 5432 from Lambda SG

# 4. If rules are wrong, update infrastructure and redeploy
```

---

## Performance Issues

### Issue: "Slow API response times"

**Symptoms**: Response times >2 seconds

**Solutions**:
```bash
# 1. Check Lambda duration
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=CiraInvoice-JobManagement-${ENVIRONMENT} \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,Maximum

# 2. Check database query performance
# Connect and run EXPLAIN ANALYZE on slow queries

# 3. Enable X-Ray tracing
aws lambda update-function-configuration \
  --function-name CiraInvoice-JobManagement-${ENVIRONMENT} \
  --tracing-config Mode=Active

# 4. Optimize:
# - Add database indexes
# - Increase Lambda memory
# - Use RDS Proxy (already implemented)
# - Cache frequently accessed data
```

---

### Issue: "High Lambda costs"

**Symptoms**: Unexpected AWS bill

**Solutions**:
```bash
# 1. Check invocation count
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=CiraInvoice-JobManagement-${ENVIRONMENT} \
  --start-time $(date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 86400 \
  --statistics Sum

# 2. Check duration
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=CiraInvoice-JobManagement-${ENVIRONMENT} \
  --start-time $(date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 86400 \
  --statistics Average

# 3. Optimize:
# - Reduce memory if underutilized
# - Optimize code execution time
# - Add caching to reduce invocations
# - Review and optimize Step Functions workflow
```

---

## Common Error Messages

### "Stack is in UPDATE_ROLLBACK_FAILED state"

```bash
# Continue rollback
aws cloudformation continue-update-rollback \
  --stack-name CiraInvoice-Api-${ENVIRONMENT}

# If specific resources are stuck
aws cloudformation continue-update-rollback \
  --stack-name CiraInvoice-Api-${ENVIRONMENT} \
  --resources-to-skip <ResourceLogicalId>
```

### "The security token included in the request is expired"

```bash
# Refresh AWS credentials
aws sso login  # If using AWS SSO
# OR
aws configure  # Reconfigure with new credentials

# Verify
aws sts get-caller-identity
```

### "Resource already exists"

```bash
# Find and delete existing resource
aws cloudformation describe-stack-resources \
  --stack-name CiraInvoice-Api-${ENVIRONMENT}

# Delete stack and redeploy
aws cloudformation delete-stack \
  --stack-name CiraInvoice-Api-${ENVIRONMENT}
```

---

## Getting Help

### 1. Check Logs First

```bash
# Lambda logs
aws logs tail /aws/lambda/CiraInvoice-JobManagement-${ENVIRONMENT} --follow

# API Gateway logs
aws logs tail /aws/apigateway/CiraInvoice-${ENVIRONMENT} --follow

# Step Functions logs
aws logs tail /aws/stepfunctions/CiraInvoice-Workflow-${ENVIRONMENT} --follow
```

### 2. Run Diagnostics

```bash
# Validate environment
./scripts/deploy/validate-env.sh ${ENVIRONMENT}

# Run health check
./scripts/deploy/health-check.sh ${ENVIRONMENT}

# Full verification
./scripts/deploy/verify-deployment.sh ${ENVIRONMENT}
```

### 3. AWS Support

For production issues, contact AWS Support:
- Navigate to AWS Support Center
- Create a case with "Technical Support"
- Include: Account ID, Region, Stack names, Error messages

### 4. Useful Commands

```bash
# Check all stack statuses
aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --query 'StackSummaries[?contains(StackName, `CiraInvoice`)].[StackName,StackStatus]' \
  --output table

# Check all Lambda functions
aws lambda list-functions \
  --query 'Functions[?contains(FunctionName, `CiraInvoice`)].[FunctionName,Runtime,LastModified]' \
  --output table

# Check all RDS instances
aws rds describe-db-instances \
  --query 'DBInstances[?contains(DBInstanceIdentifier, `cira-invoice`)].[DBInstanceIdentifier,DBInstanceStatus]' \
  --output table
```

---

## Still Stuck?

1. Review [Deployment Guide](deployment-guide.md)
2. Check [Rollback Procedures](rollback-procedures.md)
3. Verify [Prerequisites](prerequisites.md)
4. Check AWS service health: https://status.aws.amazon.com/
