-- MVP Database Schema - Simplified with API Gateway Integration
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Job status enum
DO $$ BEGIN
    CREATE TYPE job_status AS ENUM ('queued', 'processing', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Jobs table (modified for API Gateway)
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id VARCHAR(50), -- From API Gateway context (not foreign key)
    status job_status DEFAULT 'queued',
    processing_phase TEXT CHECK (processing_phase IS NULL OR processing_phase IN ('analyzing_invoice','extracting_data','verifying_data')),
    pdf_url VARCHAR(2048) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    error_message TEXT
);

-- Job results table
CREATE TABLE IF NOT EXISTS job_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID UNIQUE REFERENCES jobs(id),
    extracted_data JSONB, -- Flexible JSON storage
    confidence_score DECIMAL(3,2), -- 0.00 to 1.00
    tokens_used INTEGER,
    raw_ocr_text TEXT, -- Raw OCR Markdown output (nullable)
    ocr_provider VARCHAR(64), -- OCR provider identifier (nullable)
    ocr_duration_ms INTEGER, -- OCR duration in milliseconds (nullable)
    ocr_pages INTEGER, -- Number of pages processed, if available (nullable)
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_client_id ON jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_job_results_job_id ON job_results(job_id);

-- Auto-update trigger for updated_at
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
END $$;
