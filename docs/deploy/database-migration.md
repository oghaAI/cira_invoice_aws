# Database Migration Guide

This guide explains how to migrate from Supabase (development) to AWS RDS (production).

## Table of Contents

- [Overview](#overview)
- [When to Migrate](#when-to-migrate)
- [Pre-Migration Checklist](#pre-migration-checklist)
- [Migration Methods](#migration-methods)
- [Step-by-Step Migration](#step-by-step-migration)
- [Data Verification](#data-verification)
- [Rollback Plan](#rollback-plan)
- [Post-Migration](#post-migration)

## Overview

### Why Migrate?

**Supabase (Development)**:
- ✅ Quick setup
- ✅ Free tier available
- ✅ Easy to use
- ❌ External dependency
- ❌ Latency for AWS Lambda
- ❌ Not in your AWS account

**AWS RDS (Production)**:
- ✅ In your AWS account
- ✅ Full control
- ✅ Better integration with Lambda
- ✅ VPC isolation
- ✅ Compliance-friendly
- ❌ More expensive
- ❌ More complex to manage

### Migration Approach

We recommend **dual-write** approach:
1. Deploy RDS alongside Supabase
2. Write to both databases simultaneously
3. Verify data consistency
4. Switch reads to RDS
5. Stop writing to Supabase

## When to Migrate

Consider migrating when:

- [ ] Moving from development to staging/production
- [ ] Need better performance (lower latency)
- [ ] Require VPC isolation
- [ ] Need compliance with data residency requirements
- [ ] Want full control over database infrastructure
- [ ] Expecting high traffic (>10K requests/day)

Don't migrate if:
- Still in early development
- Testing features rapidly
- Cost is primary concern
- Using free tier Supabase

## Pre-Migration Checklist

### 1. Data Assessment

```bash
# Connect to Supabase
psql $DATABASE_URL

# Check database size
SELECT pg_size_pretty(pg_database_size(current_database()));

# Count records
SELECT
  'jobs' as table_name, COUNT(*) as row_count FROM jobs
UNION ALL
SELECT
  'job_results' as table_name, COUNT(*) as row_count FROM job_results;

# Check for active connections
SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active';
```

### 2. Schema Verification

```bash
# Export current schema
pg_dump $DATABASE_URL --schema-only > supabase-schema.sql

# Compare with RDS schema
diff supabase-schema.sql packages/database/schema.sql
```

### 3. Backup Supabase Data

```bash
# Full backup
pg_dump $DATABASE_URL > supabase-backup-$(date +%Y%m%d).sql

# Data only (no schema)
pg_dump $DATABASE_URL --data-only > supabase-data-$(date +%Y%m%d).sql

# Specific tables
pg_dump $DATABASE_URL --table=jobs --table=job_results > supabase-tables-$(date +%Y%m%d).sql
```

### 4. RDS Preparation

```bash
# Deploy RDS stack
./scripts/deploy/deploy-database.sh staging

# Verify RDS is ready
aws rds describe-db-instances \
  --db-instance-identifier cira-invoice-staging \
  --query 'DBInstances[0].DBInstanceStatus'

# Should return: "available"
```

### 5. Downtime Planning

- Schedule migration during low-traffic period
- Notify users of maintenance window
- Prepare rollback plan
- Have team available

## Migration Methods

### Method 1: pg_dump/pg_restore (Recommended)

**Pros**: Simple, reliable, preserves all data
**Cons**: Requires downtime
**Best for**: Small to medium databases (<10GB)

### Method 2: Logical Replication

**Pros**: Minimal downtime, continuous sync
**Cons**: Complex setup, requires publication/subscription
**Best for**: Large databases (>10GB), zero-downtime required

### Method 3: Dual-Write

**Pros**: No downtime, gradual migration
**Cons**: Application changes required, data sync complexity
**Best for**: Critical systems that can't have downtime

This guide focuses on **Method 1** (pg_dump/pg_restore) as it's the simplest and most reliable for most use cases.

## Step-by-Step Migration

### Phase 1: Preparation (Day 1)

#### Step 1: Deploy RDS

```bash
# Set environment to staging
export ENVIRONMENT=staging

# Update .env
cp .env.staging.template .env
nano .env  # Set USE_EXTERNAL_DATABASE=false

# Deploy database stack
./scripts/deploy/deploy-database.sh staging

# Wait for completion (10-15 minutes)
```

#### Step 2: Get RDS Credentials

```bash
# Get secret ARN from deployment
source outputs-database-staging.json

# Retrieve database credentials
aws secretsmanager get-secret-value \
  --secret-id $DB_SECRET_ARN \
  --query SecretString \
  --output text | jq -r .

# Export RDS connection string
export RDS_URL="postgresql://username:password@endpoint:5432/database"
```

#### Step 3: Verify RDS Connection

```bash
# Test connection
psql $RDS_URL -c "SELECT version();"

# Should return PostgreSQL version
```

#### Step 4: Apply Schema

```bash
# Apply schema to RDS
psql $RDS_URL -f packages/database/schema.sql

# Verify schema
psql $RDS_URL -c "\dt"

# Should show: jobs, job_results tables
```

### Phase 2: Data Migration (Day 2)

#### Step 1: Final Backup

```bash
# Create final backup
pg_dump $DATABASE_URL > supabase-final-backup-$(date +%Y%m%d-%H%M%S).sql

# Verify backup
head -n 20 supabase-final-backup-*.sql

# Check file size
ls -lh supabase-final-backup-*.sql
```

#### Step 2: Extract Data

```bash
# Export data only (no schema, since already applied)
pg_dump $DATABASE_URL \
  --data-only \
  --column-inserts \
  --no-owner \
  --no-privileges \
  > supabase-data-$(date +%Y%m%d-%H%M%S).sql
```

**Options explained**:
- `--data-only`: Only export data, not schema
- `--column-inserts`: Use INSERT with column names (safer)
- `--no-owner`: Don't set ownership
- `--no-privileges`: Don't set permissions

#### Step 3: Load Data into RDS

```bash
# Load data
psql $RDS_URL < supabase-data-*.sql

# Check for errors
# If errors occur, review and fix manually
```

#### Step 4: Verify Data

```bash
# Compare row counts
echo "Supabase:"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM jobs;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM job_results;"

echo "RDS:"
psql $RDS_URL -c "SELECT COUNT(*) FROM jobs;"
psql $RDS_URL -c "SELECT COUNT(*) FROM job_results;"

# Should match exactly
```

### Phase 3: Cutover (Day 3)

#### Step 1: Enable Maintenance Mode (Optional)

```bash
# Update API to return 503 for new requests
# This is optional - you can skip if brief inconsistency is acceptable
```

#### Step 2: Final Sync

```bash
# Capture any new data created during migration
pg_dump $DATABASE_URL \
  --data-only \
  --column-inserts \
  --table=jobs \
  --table=job_results \
  > supabase-delta-$(date +%Y%m%d-%H%M%S).sql

# Load delta
psql $RDS_URL < supabase-delta-*.sql
```

#### Step 3: Update Application

```bash
# Update .env to use RDS
sed -i 's/USE_EXTERNAL_DATABASE=true/USE_EXTERNAL_DATABASE=false/' .env

# Comment out DATABASE_URL (will use Secrets Manager)
sed -i 's/^DATABASE_URL=/#DATABASE_URL=/' .env

# Redeploy application
./scripts/deploy/deploy-application.sh staging
```

#### Step 4: Smoke Test

```bash
# Test API with RDS
source deployment-staging.config

# Health check
curl $API_ENDPOINT/

# Create test job
curl -X POST $API_ENDPOINT/jobs \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"pdf_url": "https://example.com/test.pdf"}'

# Verify data in RDS
psql $RDS_URL -c "SELECT * FROM jobs ORDER BY created_at DESC LIMIT 5;"
```

## Data Verification

### Automated Verification Script

Create a verification script:

```bash
#!/bin/bash
# verify-migration.sh

echo "Comparing Supabase and RDS..."

# Jobs count
SUPABASE_JOBS=$(psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM jobs;")
RDS_JOBS=$(psql $RDS_URL -t -c "SELECT COUNT(*) FROM jobs;")

echo "Jobs: Supabase=$SUPABASE_JOBS, RDS=$RDS_JOBS"

if [ "$SUPABASE_JOBS" = "$RDS_JOBS" ]; then
  echo "✓ Jobs count matches"
else
  echo "✗ Jobs count mismatch!"
  exit 1
fi

# Job results count
SUPABASE_RESULTS=$(psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM job_results;")
RDS_RESULTS=$(psql $RDS_URL -t -c "SELECT COUNT(*) FROM job_results;")

echo "Results: Supabase=$SUPABASE_RESULTS, RDS=$RDS_RESULTS"

if [ "$SUPABASE_RESULTS" = "$RDS_RESULTS" ]; then
  echo "✓ Results count matches"
else
  echo "✗ Results count mismatch!"
  exit 1
fi

# Check latest records
echo "Checking latest records..."
psql $DATABASE_URL -c "SELECT id, created_at FROM jobs ORDER BY created_at DESC LIMIT 5;"
psql $RDS_URL -c "SELECT id, created_at FROM jobs ORDER BY created_at DESC LIMIT 5;"

echo "✓ Verification complete"
```

### Manual Verification Queries

```sql
-- Compare table structures
-- Run on both databases
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- Compare data checksums
SELECT
  'jobs' as table_name,
  COUNT(*) as row_count,
  MD5(STRING_AGG(id::text, ',' ORDER BY id)) as checksum
FROM jobs
UNION ALL
SELECT
  'job_results' as table_name,
  COUNT(*) as row_count,
  MD5(STRING_AGG(job_id::text, ',' ORDER BY job_id)) as checksum
FROM job_results;

-- Check for gaps in data
SELECT
  created_at::date as date,
  COUNT(*) as jobs_created
FROM jobs
GROUP BY created_at::date
ORDER BY date;
```

## Rollback Plan

If issues arise after migration:

### Immediate Rollback (< 1 hour)

```bash
# 1. Revert .env to Supabase
sed -i 's/USE_EXTERNAL_DATABASE=false/USE_EXTERNAL_DATABASE=true/' .env
sed -i 's/#DATABASE_URL=/DATABASE_URL=/' .env

# 2. Redeploy application
./scripts/deploy/deploy-application.sh staging

# 3. Verify
curl $API_ENDPOINT/
```

### Delayed Rollback (> 1 hour)

If new data was written to RDS:

```bash
# 1. Export RDS data
pg_dump $RDS_URL --data-only > rds-new-data.sql

# 2. Load into Supabase
psql $DATABASE_URL < rds-new-data.sql

# 3. Revert application
# (same as immediate rollback)
```

## Post-Migration

### 1. Monitor Closely

```bash
# Watch logs
aws logs tail /aws/lambda/CiraInvoice-JobManagement-staging --follow

# Monitor errors
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=CiraInvoice-JobManagement-staging \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Sum
```

### 2. Performance Testing

```bash
# Run load tests
./scripts/deploy/test-endpoints.sh staging

# Compare response times
# Before (Supabase): X ms
# After (RDS): Y ms
```

### 3. Update Documentation

- Document migration date
- Update connection string references
- Update runbooks
- Share learnings with team

### 4. Cleanup (After 7 Days)

If migration is successful:

```bash
# Archive Supabase backups
aws s3 cp supabase-backup-*.sql s3://your-backup-bucket/

# Document Supabase shutdown
# Note: Keep Supabase project active for 30 days as backup
```

### 5. Cost Comparison

```bash
# Check RDS costs
aws ce get-cost-and-usage \
  --time-period Start=$(date -u -d '7 days ago' +%Y-%m-%d),End=$(date -u +%Y-%m-%d) \
  --granularity DAILY \
  --metrics UnblendedCost \
  --filter file://rds-cost-filter.json
```

## Troubleshooting Migration

### Issue: pg_dump fails

```bash
# Check Supabase connection
psql $DATABASE_URL -c "SELECT 1"

# Try with specific tables
pg_dump $DATABASE_URL --table=jobs > jobs-backup.sql
pg_dump $DATABASE_URL --table=job_results > results-backup.sql
```

### Issue: pg_restore fails

```bash
# Check error messages
psql $RDS_URL < backup.sql 2>&1 | tee restore-errors.log

# Fix common issues:
# - Constraint violations: Load in correct order
# - Duplicate keys: Use --data-only and fresh schema
# - Permission errors: Check RDS user permissions
```

### Issue: Data mismatch

```bash
# Identify missing records
psql $DATABASE_URL -c "
  SELECT id FROM jobs
  EXCEPT
  SELECT id FROM dblink('dbname=$RDS_URL', 'SELECT id FROM jobs') AS t(id uuid);
"

# Manual fix
# Export missing records and load into RDS
```

### Issue: Performance worse after migration

```bash
# Check indexes
psql $RDS_URL -c "\di"

# Rebuild statistics
psql $RDS_URL -c "ANALYZE jobs;"
psql $RDS_URL -c "ANALYZE job_results;"

# Check slow queries
psql $RDS_URL -c "
  SELECT query, mean_exec_time, calls
  FROM pg_stat_statements
  ORDER BY mean_exec_time DESC
  LIMIT 10;
"
```

## Migration Checklist

Use this checklist during migration:

### Pre-Migration
- [ ] RDS stack deployed and healthy
- [ ] Schema applied to RDS
- [ ] Supabase data backed up
- [ ] Verification script prepared
- [ ] Team notified of maintenance window
- [ ] Rollback plan documented

### Migration
- [ ] Final Supabase backup taken
- [ ] Data exported from Supabase
- [ ] Data loaded into RDS
- [ ] Row counts verified
- [ ] Sample data checked
- [ ] Application updated to use RDS
- [ ] Application redeployed

### Post-Migration
- [ ] Smoke tests passed
- [ ] API endpoints working
- [ ] Data consistency verified
- [ ] Performance acceptable
- [ ] Logs show no errors
- [ ] Monitoring configured
- [ ] Team notified of completion
- [ ] Documentation updated

## Best Practices

1. **Test in Staging First**: Never migrate production directly
2. **Backup Everything**: Multiple backups with verification
3. **Monitor Closely**: Watch logs and metrics for 24-48 hours
4. **Keep Supabase Active**: Don't delete immediately
5. **Document Everything**: Record issues and solutions
6. **Have Team Available**: Schedule during business hours
7. **Verify Thoroughly**: Check data integrity multiple times

## Additional Resources

- [PostgreSQL Migration Guide](https://www.postgresql.org/docs/current/backup-dump.html)
- [AWS DMS](https://aws.amazon.com/dms/) (for complex migrations)
- [RDS Best Practices](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_BestPractices.html)
