# Rollback Procedures

This guide explains how to roll back CIRA Invoice AWS deployments when issues arise.

## Table of Contents

- [When to Rollback](#when-to-rollback)
- [Automated Rollback](#automated-rollback)
- [Manual Rollback](#manual-rollback)
- [Database Rollback](#database-rollback)
- [Verification After Rollback](#verification-after-rollback)
- [Prevention Strategies](#prevention-strategies)

## When to Rollback

Consider rolling back when:

### Critical Issues
- **API is completely unavailable** (5XX errors on all endpoints)
- **Database corruption** or data loss detected
- **Security vulnerability** discovered in production
- **Complete system failure** affecting all users

### Serious Issues
- **High error rate** (>10% of requests failing)
- **Performance degradation** (response times >5x normal)
- **Data integrity issues** (incorrect calculations, missing data)
- **Critical feature broken** in production

### When NOT to Rollback
- **Minor bugs** that don't affect core functionality
- **Cosmetic issues** in logs or non-critical outputs
- **Issues that can be fixed** with a quick patch deployment
- **Problems in non-production** environments (fix forward instead)

## Automated Rollback

The automated rollback script provides a safe and guided rollback process.

### Quick Rollback

```bash
# Rollback development
./scripts/deploy/rollback.sh dev

# Rollback staging
./scripts/deploy/rollback.sh staging

# Rollback production (requires confirmation)
./scripts/deploy/rollback.sh prod
```

### Rollback Options

The script offers two rollback methods:

#### Option 1: Cancel Update (Recommended)

Rolls back to the previous stable state:
- Safest option
- Preserves data
- Quick rollback
- No data loss

```bash
# Select option 1 when prompted
1) Cancel in-progress updates (rollback to previous state)
```

#### Option 2: Delete Stacks

Completely removes all infrastructure:
- Use only for complete teardown
- **DESTROYS ALL DATA**
- Requires redeployment
- Use with extreme caution

```bash
# Select option 2 when prompted
# You will need to type 'DELETE' to confirm
2) Delete stacks completely
```

### Production Rollback Safety

For production, additional confirmations are required:

```bash
./scripts/deploy/rollback.sh prod

# You'll see:
⚠  WARNING: ROLLING BACK PRODUCTION
Are you absolutely sure? Type 'rollback-production' to confirm:
```

## Manual Rollback

If the automated script fails or you need more control, use manual rollback procedures.

### Step 1: Check Stack Status

```bash
# Check all stacks
aws cloudformation describe-stacks \
  --region us-east-1 \
  --query 'Stacks[?contains(StackName, `CiraInvoice`)].[StackName,StackStatus]' \
  --output table
```

### Step 2: Cancel Updates

For stacks in `UPDATE_IN_PROGRESS` state:

```bash
# Cancel update for API stack
aws cloudformation cancel-update-stack \
  --stack-name CiraInvoice-Api-prod \
  --region us-east-1

# Wait for rollback to complete
aws cloudformation wait stack-update-rollback-complete \
  --stack-name CiraInvoice-Api-prod \
  --region us-east-1
```

### Step 3: Rollback Order

Always rollback in this order:

1. **Monitoring Stack** (optional, non-critical)
2. **Workflow Stack** (Step Functions)
3. **API Stack** (Lambda + API Gateway)
4. **Database Stack** (RDS - **LAST**, most critical)

```bash
# Rollback stacks in order
aws cloudformation cancel-update-stack --stack-name CiraInvoice-Monitoring-prod
aws cloudformation cancel-update-stack --stack-name CiraInvoice-Workflow-prod
aws cloudformation cancel-update-stack --stack-name CiraInvoice-Api-prod

# Database last (usually not needed)
aws cloudformation cancel-update-stack --stack-name CiraInvoice-Database-prod
```

### Step 4: Monitor Rollback

```bash
# Watch stack events
watch -n 10 'aws cloudformation describe-stacks \
  --stack-name CiraInvoice-Api-prod \
  --query "Stacks[0].StackStatus"'

# View detailed events
aws cloudformation describe-stack-events \
  --stack-name CiraInvoice-Api-prod \
  --max-items 20
```

## Database Rollback

Database rollbacks are more complex and require careful planning.

### Database Snapshot Rollback

If you need to restore data:

#### Step 1: List Available Snapshots

```bash
# List RDS snapshots
aws rds describe-db-snapshots \
  --db-instance-identifier cira-invoice-prod \
  --query 'DBSnapshots[*].[DBSnapshotIdentifier,SnapshotCreateTime]' \
  --output table
```

#### Step 2: Restore from Snapshot

```bash
# Restore to new instance
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier cira-invoice-prod-restored \
  --db-snapshot-identifier cira-invoice-prod-2025-01-12 \
  --db-instance-class db.r5.large

# Wait for restore
aws rds wait db-instance-available \
  --db-instance-identifier cira-invoice-prod-restored
```

#### Step 3: Switch Application

```bash
# Update application to point to restored instance
# This requires updating the database endpoint in Secrets Manager
# and redeploying the API stack
```

### Schema Rollback

For schema migrations that need to be rolled back:

```bash
# Connect to database
psql $DATABASE_URL

# Run rollback SQL (if you have a migration rollback script)
-- Example:
-- DROP TABLE IF EXISTS new_table;
-- ALTER TABLE jobs DROP COLUMN IF EXISTS new_column;
```

### Database Rollback Considerations

- **Always test** rollback procedures in staging first
- **Take snapshot** before making schema changes
- **Document migration** and rollback scripts
- **Verify data integrity** after rollback
- **Coordinate with team** before database changes

## Verification After Rollback

After rolling back, verify the system is healthy:

### Step 1: Health Check

```bash
# Run health check
./scripts/deploy/health-check.sh prod

# Should show all checks passing
```

### Step 2: Test Endpoints

```bash
# Test API endpoints
./scripts/deploy/test-endpoints.sh prod

# Manual test
source deployment-prod.config
curl $API_ENDPOINT/
```

### Step 3: Check Metrics

```bash
# Check Lambda invocations
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=CiraInvoice-JobManagement-prod \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum

# Check API Gateway errors
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name 5XXError \
  --dimensions Name=ApiName,Value=CiraInvoice-prod \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

### Step 4: Review Logs

```bash
# Check for errors
aws logs tail /aws/lambda/CiraInvoice-JobManagement-prod \
  --since 30m \
  --filter-pattern "ERROR"

# Check recent activity
aws logs tail /aws/lambda/CiraInvoice-JobManagement-prod \
  --since 10m \
  --follow
```

### Step 5: User Acceptance

- Test critical user workflows
- Verify data integrity
- Check recent transactions
- Monitor for new errors

## Rollback Checklist

Use this checklist during rollback:

### Pre-Rollback
- [ ] Identify the issue and confirm rollback is necessary
- [ ] Notify team and stakeholders
- [ ] Document current state and issue
- [ ] Identify target version to rollback to
- [ ] Verify backup/snapshot is available (for database)

### During Rollback
- [ ] Cancel or delete stacks in correct order
- [ ] Monitor CloudFormation events
- [ ] Check for errors in logs
- [ ] Verify each stack rollback completes successfully

### Post-Rollback
- [ ] Run health checks
- [ ] Test API endpoints
- [ ] Verify database integrity
- [ ] Check CloudWatch metrics
- [ ] Monitor logs for errors
- [ ] Test critical user workflows
- [ ] Notify team and stakeholders of completion
- [ ] Document rollback details and learnings

## Common Rollback Scenarios

### Scenario 1: Failed Deployment

**Issue**: CloudFormation stack stuck in `UPDATE_ROLLBACK_FAILED`

```bash
# Check what's stuck
aws cloudformation describe-stack-resources \
  --stack-name CiraInvoice-Api-prod \
  --query 'StackResources[?ResourceStatus==`UPDATE_FAILED`]'

# Continue rollback
aws cloudformation continue-update-rollback \
  --stack-name CiraInvoice-Api-prod

# If that fails, you may need to skip resources
aws cloudformation continue-update-rollback \
  --stack-name CiraInvoice-Api-prod \
  --resources-to-skip ResourceLogicalId1 ResourceLogicalId2
```

### Scenario 2: Database Migration Issue

**Issue**: Schema migration broke application

```bash
# 1. Rollback application first
./scripts/deploy/rollback.sh prod

# 2. Connect to database and rollback schema
psql $DATABASE_URL -f migrations/rollback-v2.sql

# 3. Verify schema
psql $DATABASE_URL -c "\d jobs"

# 4. Test application
curl $API_ENDPOINT/
```

### Scenario 3: Lambda Timeout

**Issue**: New Lambda code timing out

```bash
# Quick fix: Increase timeout temporarily
aws lambda update-function-configuration \
  --function-name CiraInvoice-JobManagement-prod \
  --timeout 30

# Then rollback code
./scripts/deploy/rollback.sh prod
```

### Scenario 4: Broken API Gateway

**Issue**: API Gateway configuration broken

```bash
# Rollback API stack only
aws cloudformation cancel-update-stack \
  --stack-name CiraInvoice-Api-prod

# Wait and verify
aws cloudformation wait stack-update-rollback-complete \
  --stack-name CiraInvoice-Api-prod
```

## Prevention Strategies

Minimize the need for rollbacks:

### Before Deployment

1. **Test thoroughly in staging**
   ```bash
   # Deploy to staging first
   ./scripts/deploy/deploy.sh staging

   # Run full tests
   ./scripts/deploy/verify-deployment.sh staging
   ```

2. **Use gradual rollout** (not implemented yet)
   - Deploy to 10% of traffic first
   - Monitor metrics
   - Gradually increase to 100%

3. **Review changes carefully**
   ```bash
   # Preview changes
   cd packages/infrastructure
   cdk diff --context environment=prod
   ```

### During Deployment

1. **Monitor actively**
   - Watch CloudWatch logs in real-time
   - Monitor error rates
   - Check Lambda metrics

2. **Have team available**
   - Schedule deployments during business hours
   - Have multiple team members available
   - Have rollback plan ready

### After Deployment

1. **Smoke test immediately**
   ```bash
   ./scripts/deploy/test-endpoints.sh prod
   ```

2. **Monitor for 30 minutes**
   - Watch error rates
   - Check response times
   - Review logs

3. **Document issues**
   - Record any warnings or errors
   - Update runbooks
   - Share learnings with team

## Rollback Time Estimates

| Rollback Type | Duration |
|---------------|----------|
| Cancel stack update | 5-10 minutes |
| Full application rollback | 10-15 minutes |
| Database snapshot restore | 15-30 minutes |
| Complete teardown | 20-30 minutes |

**Note**: Database operations take significantly longer

## Support During Rollback

### Escalation Path

1. **Team Lead**: Immediate notification
2. **DevOps Team**: If infrastructure issues
3. **AWS Support**: If AWS service issues (for production)
4. **Database Admin**: If database issues

### Communication Template

```
Subject: [URGENT] Rolling back production deployment

Issue: [Brief description]
Impact: [User impact]
Action: Rolling back to previous version
ETA: [Estimated time]
Status: [In Progress / Complete]

Team: Please standby and monitor
```

## Post-Rollback Actions

After a successful rollback:

1. **Root cause analysis**
   - What went wrong?
   - Why wasn't it caught in testing?
   - How can we prevent it?

2. **Update documentation**
   - Document the issue
   - Update rollback procedures
   - Add to troubleshooting guide

3. **Fix and redeploy**
   - Fix the issue
   - Test thoroughly
   - Deploy when ready

4. **Review and improve**
   - Update CI/CD pipelines
   - Enhance monitoring
   - Improve testing

## Additional Resources

- [AWS CloudFormation Troubleshooting](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/troubleshooting.html)
- [RDS Snapshot Restore](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_RestoreFromSnapshot.html)
- [Troubleshooting Guide](troubleshooting.md)
