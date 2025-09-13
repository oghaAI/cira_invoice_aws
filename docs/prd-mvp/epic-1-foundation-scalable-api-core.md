# Epic 1: Foundation & Scalable API Core

**Epic Goal:** Build the scalable foundation that can handle 3,000 jobs/day, with auto-scaling infrastructure and high-throughput job submission. This delivers immediate testable value with enterprise-ready performance characteristics.

## Story 1.1: Project Setup
As a **developer**,  
I want **basic monorepo with TypeScript and AWS CDK**,  
so that **I can build and deploy the MVP efficiently**.

### Acceptance Criteria
1. Create packages structure: api/, database/, infrastructure/
2. Configure TypeScript with basic settings
3. Set up AWS CDK for infrastructure deployment  
4. Add Vitest for testing framework
5. Create basic deployment script
6. Document setup in README

## Story 1.2: Scalable AWS Infrastructure
As a **high-volume system**,  
I want **auto-scaling AWS services provisioned**,  
so that **the API can handle 3,000+ daily jobs reliably**.

### Acceptance Criteria
1. Deploy PostgreSQL RDS with connection pooling and auto-scaling storage
2. Create API Gateway with rate limiting and Lambda integration 
3. Set up Step Functions with concurrent execution limits for high throughput
4. Configure CloudWatch logging with log retention for volume monitoring
5. Add Lambda reserved concurrency settings for predictable performance
6. Create auto-scaling policies for database connections and compute resources

## Story 1.3: Database Schema  
As a **data store**,  
I want **simple tables for jobs and results**,  
so that **I can persist job information reliably**.

### Acceptance Criteria
1. Create jobs table (id, status, pdf_url, timestamps, error_message)
2. Create job_results table (job_id, extracted_data JSONB, confidence_score, tokens_used)
3. Create api_keys table (id, key_value, name, is_active)
4. Add basic indexes for performance
5. Create database connection utility
6. Add sample data for development

## Story 1.4: Core API Endpoints
As an **API client**,  
I want **job submission and status endpoints**,  
so that **I can submit PDFs and check processing status**.

### Acceptance Criteria
1. Implement POST /jobs endpoint (accepts pdf_url, returns job_id)
2. Implement GET /jobs/{id}/status endpoint
3. Add basic input validation for PDF URLs
4. Store jobs with "queued" status in database
5. Return consistent JSON responses
6. Add health check endpoint
7. Add basic API key authentication middleware

## Story 1.5: Basic Job Management
As a **job system**,  
I want **simple job status tracking**,  
so that **status updates work correctly**.

### Acceptance Criteria
1. Implement job status states: queued → processing → completed/failed
2. Create status update functions with error handling
3. Add job cleanup for old completed jobs (>90 days)
4. Implement basic timeout handling
5. Add status validation to prevent invalid transitions
6. Create job retrieval functions
