# Database Schema

```sql
-- CIRA Invoice Processing System Database Schema
-- PostgreSQL 15.4 - Production Ready Schema

-- Enable UUID extension for correlation IDs and future use
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types for enums
CREATE TYPE job_status AS ENUM (
    'queued',
    'processing_ocr',
    'extracting_data', 
    'verifying',
    'completed',
    'failed'
);

CREATE TYPE processing_event_type AS ENUM (
    'status_change',
    'external_api_call',
    'error_occurred',
    'retry_attempt',
    'cost_attribution'
);

-- API Keys table - Client authentication and usage tracking
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    usage_count INTEGER DEFAULT 0,
    monthly_usage INTEGER DEFAULT 0,
    rate_limit INTEGER DEFAULT 60, -- requests per minute
    
    CONSTRAINT valid_rate_limit CHECK (rate_limit > 0),
    CONSTRAINT valid_usage CHECK (usage_count >= 0 AND monthly_usage >= 0)
);

-- Jobs table - Central job tracking and lifecycle management
CREATE TABLE jobs (
    id VARCHAR(21) PRIMARY KEY, -- NanoID format
    api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE RESTRICT,
    status job_status NOT NULL DEFAULT 'queued',
    pdf_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    processing_cost DECIMAL(10,4) DEFAULT 0.0000,
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    correlation_id UUID DEFAULT uuid_generate_v4(),
    
    CONSTRAINT valid_pdf_url CHECK (pdf_url ~* '^https?://.*\.pdf(\?.*)?$'),
    CONSTRAINT valid_processing_cost CHECK (processing_cost >= 0),
    CONSTRAINT valid_retry_count CHECK (retry_count >= 0),
    CONSTRAINT completed_at_consistency CHECK (
        (status = 'completed' AND completed_at IS NOT NULL) OR
        (status != 'completed' AND completed_at IS NULL)
    )
);

-- Job Results table - Structured extracted invoice data based on InvoiceSchema
CREATE TABLE job_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id VARCHAR(21) NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    
    -- Invoice Schema Fields (all nullable as per Zod schema)
    invoice_date DATE,
    invoice_number VARCHAR(100),
    invoice_due_date DATE,
    invoice_past_due_amount DECIMAL(12,2),
    invoice_current_due_amount DECIMAL(12,2),
    invoice_late_fee_amount DECIMAL(12,2),
    credit_amount DECIMAL(12,2),
    policy_number VARCHAR(100),
    account_number VARCHAR(100),
    policy_start_date DATE,
    policy_end_date DATE,
    service_start_date DATE,
    service_end_date DATE,
    payment_remittance_address TEXT,
    payment_remittance_entity VARCHAR(255),
    payment_remittance_entity_care_of VARCHAR(255),
    reasoning TEXT,
    community_name VARCHAR(255),
    vendor_name VARCHAR(255),
    valid_input BOOLEAN,
    
    -- System fields
    confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0.00 AND confidence_score <= 1.00),
    raw_ocr_text TEXT,
    llm_tokens_used INTEGER DEFAULT 0,
    additional_data JSONB, -- Future extensibility
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_amounts CHECK (
        (invoice_past_due_amount IS NULL OR invoice_past_due_amount >= 0) AND
        (invoice_current_due_amount IS NULL OR invoice_current_due_amount >= 0) AND
        (invoice_late_fee_amount IS NULL OR invoice_late_fee_amount >= 0) AND
        (credit_amount IS NULL OR credit_amount >= 0)
    ),
    CONSTRAINT valid_dates CHECK (
        (invoice_due_date IS NULL OR invoice_date IS NULL OR invoice_due_date >= invoice_date) AND
        (policy_end_date IS NULL OR policy_start_date IS NULL OR policy_end_date >= policy_start_date) AND
        (service_end_date IS NULL OR service_start_date IS NULL OR service_end_date >= service_start_date)
    ),
    CONSTRAINT valid_tokens CHECK (llm_tokens_used >= 0)
);


-- Processing Events table - Comprehensive audit trail and cost tracking
CREATE TABLE processing_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id VARCHAR(21) NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    event_type processing_event_type NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    details JSONB, -- Event-specific metadata
    cost_incurred DECIMAL(10,6) DEFAULT 0.000000,
    external_service VARCHAR(50), -- 'docling', 'openai', 'aws', etc.
    duration_ms INTEGER,
    correlation_id UUID,
    
    CONSTRAINT valid_cost CHECK (cost_incurred >= 0),
    CONSTRAINT valid_duration CHECK (duration_ms >= 0 OR duration_ms IS NULL)
);

-- Indexes for performance optimization
-- Jobs table indexes
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_created_at ON jobs(created_at);
CREATE INDEX idx_jobs_api_key_id ON jobs(api_key_id);
CREATE INDEX idx_jobs_updated_at ON jobs(updated_at);
CREATE INDEX idx_jobs_correlation_id ON jobs(correlation_id);

-- Job Results table indexes  
CREATE INDEX idx_job_results_job_id ON job_results(job_id);
CREATE INDEX idx_job_results_vendor ON job_results(vendor_name);
CREATE INDEX idx_job_results_invoice_date ON job_results(invoice_date);
CREATE INDEX idx_job_results_invoice_number ON job_results(invoice_number);
CREATE INDEX idx_job_results_policy_number ON job_results(policy_number);
CREATE INDEX idx_job_results_account_number ON job_results(account_number);
CREATE INDEX idx_job_results_community_name ON job_results(community_name);

-- JSONB indexes for additional data queries
CREATE INDEX idx_job_results_additional_data_gin ON job_results USING GIN (additional_data);

-- Processing Events table indexes
CREATE INDEX idx_processing_events_job_id ON processing_events(job_id);
CREATE INDEX idx_processing_events_timestamp ON processing_events(timestamp);
CREATE INDEX idx_processing_events_event_type ON processing_events(event_type);
CREATE INDEX idx_processing_events_external_service ON processing_events(external_service);

-- API Keys table indexes
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_is_active ON api_keys(is_active);
CREATE INDEX idx_api_keys_last_used_at ON api_keys(last_used_at);

-- Composite indexes for common query patterns
CREATE INDEX idx_jobs_status_created_at ON jobs(status, created_at);
CREATE INDEX idx_jobs_api_key_status ON jobs(api_key_id, status);
CREATE INDEX idx_processing_events_job_timestamp ON processing_events(job_id, timestamp);

-- Functions and triggers for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_jobs_updated_at 
    BEFORE UPDATE ON jobs 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function for monthly usage reset (called by scheduled job)
CREATE OR REPLACE FUNCTION reset_monthly_usage()
RETURNS void AS $$
BEGIN
    UPDATE api_keys SET monthly_usage = 0;
END;
$$ language 'plpgsql';

-- Views for common queries and reporting
CREATE VIEW active_jobs_summary AS
SELECT 
    status,
    COUNT(*) as job_count,
    AVG(processing_cost) as avg_cost,
    AVG(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))/60) as avg_processing_minutes
FROM jobs 
WHERE status IN ('queued', 'processing_ocr', 'extracting_data', 'verifying')
GROUP BY status;

CREATE VIEW daily_processing_stats AS
SELECT 
    DATE(created_at) as processing_date,
    COUNT(*) as total_jobs,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_jobs,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs,
    AVG(processing_cost) as avg_cost,
    SUM(processing_cost) as total_cost
FROM jobs 
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY processing_date DESC;

-- Data retention policy implementation
CREATE OR REPLACE FUNCTION cleanup_old_jobs()
RETURNS void AS $$
BEGIN
    -- Archive jobs older than 90 days (PRD requirement)
    DELETE FROM jobs 
    WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days'
    AND status IN ('completed', 'failed');
    
    -- Clean up orphaned processing events
    DELETE FROM processing_events 
    WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '90 days';
END;
$$ language 'plpgsql';

-- Initial data setup
INSERT INTO api_keys (key_hash, name, is_active) VALUES 
('$2b$12$dummy_hash_for_development_key', 'Development Key', true);

-- Grant permissions (adjust for your deployment user)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cira_app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cira_app_user;
```
