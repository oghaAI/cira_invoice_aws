/**
 * CIRA Invoice Processing System - Database Schema Migration
 *
 * This Lambda function handles database schema initialization and updates.
 * It's designed to be run once after stack deployment to set up the database
 * schema with all required tables, indexes, and constraints.
 *
 * Schema Components:
 * - jobs table: Core job tracking with status and processing phases
 * - job_results table: Extracted invoice data and OCR metadata
 * - Indexes for performance optimization
 * - Triggers for automatic timestamp updates
 * - Constraints for data integrity
 *
 * Security Features:
 * - Uses AWS Secrets Manager for database credentials
 * - Connects via VPC (no internet access)
 * - Uses SSL/TLS for database connections
 *
 * Usage:
 * 1. Deploy infrastructure stack
 * 2. Invoke this Lambda function once: aws lambda invoke --function-name <function-name>
 * 3. Check logs for success/failure
 *
 * Based on: docs/architecture-mvp.md (Database Schema section)
 */
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Client } from 'pg';

// Database schema SQL embedded inline to avoid CDK asset packaging complexity
// This ensures the schema is always available and versioned with the code
const schemaSql = `
-- ============================================================================
-- CIRA INVOICE PROCESSING SYSTEM - DATABASE SCHEMA
-- ============================================================================
-- This schema supports a 3-step invoice processing workflow:
-- 1. PDF ingestion and job creation
-- 2. OCR processing and text extraction
-- 3. LLM extraction and structured data output
-- Based on: docs/architecture-mvp.md (Database Schema section)

-- Enable UUID extension for primary keys
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create job status enumeration type
DO $$ BEGIN
    CREATE TYPE job_status AS ENUM ('queued', 'processing', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;  -- Ignore if already exists
END $$;

-- ============================================================================
-- JOBS TABLE - Core job tracking and workflow state
-- ============================================================================
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),                    -- Unique job identifier
    client_id VARCHAR(50),                                             -- API client identifier (future use)
    status job_status DEFAULT 'queued',                                -- Current job status
    processing_phase TEXT CHECK (                                      -- Sub-status during processing
        processing_phase IS NULL OR
        processing_phase IN ('analyzing_invoice','extracting_data','verifying_data')
    ),
    pdf_url VARCHAR(2048) NOT NULL,                                    -- Source PDF URL for processing
    created_at TIMESTAMP DEFAULT NOW(),                                -- Job creation timestamp
    updated_at TIMESTAMP DEFAULT NOW(),                                -- Last update timestamp (auto-updated)
    completed_at TIMESTAMP,                                            -- Job completion timestamp
    error_message TEXT                                                 -- Error details if job failed
);

-- ============================================================================
-- JOB_RESULTS TABLE - Extracted invoice data and processing metadata
-- ============================================================================
CREATE TABLE IF NOT EXISTS job_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),                    -- Unique result identifier
    job_id UUID UNIQUE REFERENCES jobs(id),                           -- One result per job
    extracted_data JSONB,                                             -- Structured invoice data (JSON)
    confidence_score DECIMAL(3,2),                                    -- Overall extraction confidence (0.00-1.00)
    tokens_used INTEGER,                                              -- LLM tokens consumed (for cost tracking)
    created_at TIMESTAMP DEFAULT NOW()                                -- Result creation timestamp
);

-- ============================================================================
-- OCR METADATA COLUMNS - Add OCR-specific tracking columns
-- ============================================================================
-- These columns store OCR processing details for performance monitoring

DO $$ BEGIN
    ALTER TABLE job_results ADD COLUMN IF NOT EXISTS raw_ocr_text TEXT;        -- Original OCR output
EXCEPTION WHEN undefined_column THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE job_results ADD COLUMN IF NOT EXISTS ocr_provider VARCHAR(64); -- OCR service used
EXCEPTION WHEN undefined_column THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE job_results ADD COLUMN IF NOT EXISTS ocr_duration_ms INTEGER;  -- OCR processing time
EXCEPTION WHEN undefined_column THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE job_results ADD COLUMN IF NOT EXISTS ocr_pages INTEGER;       -- Number of pages processed
EXCEPTION WHEN undefined_column THEN null; END $$;

-- ============================================================================
-- PERFORMANCE INDEXES - Optimize common query patterns
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);                   -- Status filtering (API queries)
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);           -- Time-based sorting
CREATE INDEX IF NOT EXISTS idx_jobs_client_id ON jobs(client_id);             -- Client-specific queries
CREATE INDEX IF NOT EXISTS idx_job_results_job_id ON job_results(job_id);     -- Job-result lookups

-- ============================================================================
-- AUTOMATIC TIMESTAMP UPDATES - Trigger for updated_at column
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();  -- Set updated_at to current timestamp on any update
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic updated_at updates
DO $$ BEGIN
    CREATE TRIGGER trigger_jobs_updated_at
        BEFORE UPDATE ON jobs
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at();
EXCEPTION
    WHEN duplicate_object THEN null;  -- Ignore if trigger already exists
END $$;

-- ============================================================================
-- BACKWARD COMPATIBILITY - Ensure processing_phase column exists
-- ============================================================================
-- Handle existing databases that may not have the processing_phase column

DO $$ BEGIN
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS processing_phase TEXT;
EXCEPTION
    WHEN undefined_table THEN null;
END $$;

-- Add check constraint for processing_phase values
DO $$ BEGIN
    ALTER TABLE jobs ADD CONSTRAINT jobs_processing_phase_check CHECK (
        processing_phase IS NULL OR
        processing_phase IN ('analyzing_invoice','extracting_data','verifying_data')
    );
EXCEPTION
    WHEN duplicate_object THEN null;  -- Ignore if constraint already exists
END $$;`;

/**
 * Lambda Handler - Database Schema Migration
 *
 * This function performs the following operations:
 * 1. Retrieves database credentials from AWS Secrets Manager
 * 2. Establishes a secure connection to the PostgreSQL RDS instance
 * 3. Executes the complete database schema setup SQL
 * 4. Handles errors gracefully and ensures connections are closed
 *
 * Environment Variables Required:
 * - SECRET_ARN: AWS Secrets Manager ARN containing database credentials
 * - DB_HOST: RDS instance hostname
 * - DB_NAME: Target database name (usually 'cira_invoice')
 *
 * @returns Promise<{status: string}> Success indicator
 */
export const handler = async () => {
  // Extract required environment variables
  const secretArn = process.env['SECRET_ARN']!;
  const dbHost = process.env['DB_HOST']!;
  const dbName = process.env['DB_NAME']!;

  console.log(`Starting schema migration for database: ${dbName}`);

  // Initialize AWS Secrets Manager client
  const sm = new SecretsManagerClient({});

  try {
    // Retrieve database credentials from Secrets Manager
    const resp = await sm.send(new GetSecretValueCommand({ SecretId: secretArn }));
    const creds = JSON.parse(resp.SecretString || '{}');

    console.log(`Retrieved credentials for user: ${creds.username}`);

    // Create PostgreSQL client with SSL configuration
    const client = new Client({
      host: dbHost,                              // RDS instance hostname
      user: creds.username,                      // Database username from secrets
      password: creds.password,                  // Database password from secrets
      database: dbName,                          // Target database name
      port: 5432,                               // PostgreSQL default port
      ssl: { rejectUnauthorized: false }         // Required for RDS connections
    });

    // Connect to database and execute schema SQL
    await client.connect();
    console.log('Connected to database successfully');

    try {
      // Execute the complete schema SQL in a single transaction
      await client.query(schemaSql);
      console.log('Schema migration completed successfully');
    } finally {
      // Ensure database connection is always closed
      await client.end();
      console.log('Database connection closed');
    }

    return { status: 'ok', message: 'Schema migration completed successfully' };

  } catch (error) {
    // Log error details for debugging
    console.error('Schema migration failed:', error);
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};
