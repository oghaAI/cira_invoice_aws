import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Client } from 'pg';

// Embed schema SQL inline to avoid asset packaging complexity
const schemaSql = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
DO $$ BEGIN
    CREATE TYPE job_status AS ENUM ('queued', 'processing', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id VARCHAR(50),
    status job_status DEFAULT 'queued',
    processing_phase TEXT CHECK (processing_phase IS NULL OR processing_phase IN ('analyzing_invoice','extracting_data','verifying_data')),
    pdf_url VARCHAR(2048) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    error_message TEXT
);
CREATE TABLE IF NOT EXISTS job_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID UNIQUE REFERENCES jobs(id),
    extracted_data JSONB,
    confidence_score DECIMAL(3,2),
    tokens_used INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_client_id ON jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_job_results_job_id ON job_results(job_id);
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DO $$ BEGIN
    CREATE TRIGGER trigger_jobs_updated_at
        BEFORE UPDATE ON jobs
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at();
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Ensure processing_phase exists and has check constraint for existing tables
DO $$ BEGIN
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS processing_phase TEXT;
EXCEPTION
    WHEN undefined_table THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE jobs ADD CONSTRAINT jobs_processing_phase_check CHECK (
        processing_phase IS NULL OR processing_phase IN ('analyzing_invoice','extracting_data','verifying_data')
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;`;

export const handler = async () => {
  const secretArn = process.env['SECRET_ARN']!;
  const dbHost = process.env['DB_HOST']!;
  const dbName = process.env['DB_NAME']!;

  const sm = new SecretsManagerClient({});
  const resp = await sm.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const creds = JSON.parse(resp.SecretString || '{}');

  const client = new Client({
    host: dbHost,
    user: creds.username,
    password: creds.password,
    database: dbName,
    port: 5432,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  try {
    await client.query(schemaSql);
  } finally {
    await client.end();
  }

  return { status: 'ok' };
};
