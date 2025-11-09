# Supabase Setup Guide

This guide explains how to use Supabase (or any external PostgreSQL database) as an alternative to AWS RDS for development and testing.

## Why Use Supabase?

- **Free Tier**: 500MB database, 500MB file storage, 2GB bandwidth
- **Zero AWS Costs**: No RDS charges during development
- **Fast Setup**: No 5-10 minute RDS provisioning wait
- **Faster Lambda Cold Starts**: No VPC overhead
- **Built-in Tools**: Database UI, auto-generated REST API, real-time subscriptions
- **Easy Switching**: Switch back to RDS for production with one environment variable

## Quick Start

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com/) and sign up/login
2. Click "New Project"
3. Fill in project details:
   - **Name**: `cira-invoice-dev` (or your preferred name)
   - **Database Password**: Choose a strong password (save this!)
   - **Region**: Choose closest to you (e.g., `us-east-1`)
   - **Pricing Plan**: Free (500MB database)
4. Click "Create new project"
5. Wait ~2 minutes for provisioning

### 2. Get Your Connection String

1. In your Supabase project dashboard, go to **Settings** → **Database**
2. Scroll down to **Connection String** section
3. Select **URI** tab
4. Copy the connection string (looks like):
   ```
   postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
   ```
5. Replace `[YOUR-PASSWORD]` with the password you set in step 1

### 3. Configure Your Environment

Update your `.env` file:

```bash
# Enable external database mode
USE_EXTERNAL_DATABASE=true

# Set your Supabase connection string
DATABASE_URL=postgresql://postgres.abcdefghijklm:YOUR-PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

### 4. Create Database Tables

You need to create the database schema in your Supabase database. You have two options:

#### Option A: Using Supabase SQL Editor (Easiest)

1. Go to your Supabase project dashboard
2. Click **SQL Editor** in the sidebar
3. Click **New query**
4. Copy the contents of `packages/database/schema.sql` into the editor
5. Click **Run** or press `Cmd/Ctrl + Enter`

This will create:
- ✅ `jobs` table (stores job metadata and status)
- ✅ `job_results` table (stores OCR output and LLM extraction results)
- ✅ Required indexes for performance
- ✅ Triggers for automatic timestamp updates

#### Option B: Using psql Command Line

```bash
# From project root
psql "postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres" \
  -f packages/database/schema.sql
```

Replace the connection string with yours from step 2.

#### Verify Tables Were Created

In Supabase dashboard:
1. Go to **Table Editor**
2. You should see two tables: `jobs` and `job_results`

Or using SQL Editor:
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public';
```

### 5. Deploy to AWS

Now deploy your infrastructure (without RDS):

```bash
# From project root
npm run deploy:dev
```

The deployment will:
- ✅ **Skip** creating RDS infrastructure (saves ~$20-50/month)
- ✅ **Skip** creating VPC, security groups, and RDS Proxy
- ✅ Deploy Lambda functions **without VPC** (faster cold starts!)
- ✅ Configure Lambda functions to use your Supabase connection string

### 6. Verify Setup

Test your API to ensure it's connecting to Supabase:

```bash
# Get API endpoint from deployment output
export API_ENDPOINT="https://your-api-id.execute-api.us-east-1.amazonaws.com/dev"
export API_KEY="your-api-key-from-deployment"

# Test health endpoint
curl $API_ENDPOINT

# Create a test job
curl -X POST $API_ENDPOINT/jobs \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"pdf_url": "https://example.com/invoice.pdf"}'
```

## Viewing Your Data

Supabase provides a built-in SQL editor and table editor:

1. Go to your Supabase project dashboard
2. Click **Table Editor** in the sidebar
3. Select `jobs` or `job_results` tables
4. View, edit, and query your data directly

You can also use the **SQL Editor** for custom queries:

```sql
-- View all jobs
SELECT * FROM jobs ORDER BY created_at DESC LIMIT 10;

-- View job results with extracted data
SELECT
  j.id,
  j.status,
  jr.extracted_data->>'vendor_name' as vendor,
  jr.extracted_data->>'invoice_date' as invoice_date,
  jr.confidence_score
FROM jobs j
LEFT JOIN job_results jr ON j.id = jr.job_id
ORDER BY j.created_at DESC;
```

## Switching to RDS (Production)

When ready to use AWS RDS for production:

### Option 1: Change Environment Variable

```bash
# In your .env file
USE_EXTERNAL_DATABASE=false

# Deploy
npm run deploy:prod
```

### Option 2: Use Different Env for Each Environment

- **Development**: Keep Supabase (`USE_EXTERNAL_DATABASE=true`)
- **Staging**: Use RDS (`USE_EXTERNAL_DATABASE=false`)
- **Production**: Always use RDS (hardcoded in config)

The configuration automatically handles this based on the environment.

## Migrating Data from Supabase to RDS

If you need to migrate data from Supabase to RDS:

### 1. Export from Supabase

```bash
# Use pg_dump to export data
pg_dump "postgresql://postgres.xxx:password@aws-0-region.pooler.supabase.com:6543/postgres" \
  --data-only \
  --table=jobs \
  --table=job_results \
  > supabase_data.sql
```

### 2. Import to RDS

```bash
# Get RDS connection details from AWS Secrets Manager
aws secretsmanager get-secret-value --secret-id dev/rds/credentials

# Import data
psql "postgresql://postgres:password@your-rds-endpoint:5432/cira_invoice" \
  < supabase_data.sql
```

## Troubleshooting

### Connection Errors

**Error**: `getaddrinfo ENOTFOUND`
- **Solution**: Check that your DATABASE_URL is correct
- **Verify**: Connection string includes `.pooler.supabase.com` for connection pooling

**Error**: `password authentication failed`
- **Solution**: Ensure you replaced `[YOUR-PASSWORD]` in the connection string
- **Verify**: Password doesn't contain special characters that need URL encoding

### SSL Errors

**Error**: `SSL connection required`
- **Solution**: Supabase requires SSL by default
- **Fix**: The database client in `packages/database/src/index.ts` already enables SSL by default

### Performance Issues

**Slow queries**:
- Supabase free tier has shared resources
- Consider upgrading to paid tier or using RDS for production workloads

**Connection pool exhausted**:
- Supabase free tier: 60 direct connections, 200 pooled connections
- Use the `.pooler.supabase.com` endpoint (not direct connection)

## Supabase Limits (Free Tier)

- **Database Size**: 500 MB
- **File Storage**: 500 MB
- **Bandwidth**: 2 GB/month
- **Pooled Connections**: 200 concurrent
- **Direct Connections**: 60 concurrent
- **API Requests**: Unlimited

For production use, either:
1. Upgrade to Supabase Pro ($25/month)
2. Switch to AWS RDS (included in this infrastructure)

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Database Guide](https://supabase.com/docs/guides/database)
- [PostgreSQL Connection Strings](https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNSTRING)
- [Drizzle ORM with Supabase](https://orm.drizzle.team/docs/get-started-postgresql#supabase)

## Cost Comparison

| Aspect | Supabase (Free) | AWS RDS (t3.micro) |
|--------|----------------|---------------------|
| Monthly Cost | $0 | ~$15-25 |
| Setup Time | 2 minutes | 10 minutes |
| Cold Starts | Faster (no VPC) | Slower (VPC overhead) |
| Suitable For | Development, Testing | Staging, Production |
| Bandwidth | 2GB/month | Unlimited (separate costs) |
| Database Size | 500MB | 20GB+ (auto-scaling) |

**Recommendation**: Use Supabase for development, AWS RDS for production.

---

## Quick Reference

### Complete Setup Commands

```bash
# 1. Set environment variables in .env
USE_EXTERNAL_DATABASE=true
DATABASE_URL=postgresql://postgres.xxx:password@aws-0-region.pooler.supabase.com:6543/postgres

# 2. Create tables in Supabase (using SQL Editor or psql)
# Copy packages/database/schema.sql into Supabase SQL Editor and run

# 3. Deploy infrastructure
npm run deploy:dev

# 4. Test API
export API_ENDPOINT="your-api-endpoint-from-output"
export API_KEY="your-api-key-from-output"
curl $API_ENDPOINT  # Should return health check
```

### Schema File Location

The database schema is located at:
```
packages/database/schema.sql
```

This file contains the SQL to create:
- `jobs` table
- `job_results` table
- Indexes
- Triggers

### Useful SQL Queries

```sql
-- View all jobs
SELECT id, status, pdf_url, created_at
FROM jobs
ORDER BY created_at DESC
LIMIT 10;

-- View job with results
SELECT
  j.id,
  j.status,
  j.pdf_url,
  jr.extracted_data->>'vendor_name' as vendor,
  jr.extracted_data->>'invoice_date' as invoice_date,
  jr.confidence_score
FROM jobs j
LEFT JOIN job_results jr ON j.id = jr.job_id
WHERE j.id = 'your-job-id';

-- Count jobs by status
SELECT status, COUNT(*)
FROM jobs
GROUP BY status;

-- Delete all test data
DELETE FROM job_results;
DELETE FROM jobs;
```
