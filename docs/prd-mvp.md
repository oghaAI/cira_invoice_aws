# CIRA Invoice Processing System Product Requirements Document (MVP)

**Version:** 2.0 (MVP-Focused)  
**Date:** 2025-09-11  
**Status:** Ready for MVP Development

## Goals and Background Context

### Goals
- Process 3,000 invoices/day (90,000/month) with 95% accuracy using scalable 3-step workflow
- Reduce manual processing from 15-30 minutes to under 2 minutes per invoice
- Handle peak loads of 125+ invoices/hour with auto-scaling architecture
- Provide cost-transparent API-first solution optimized for enterprise volume
- Build the simplest thing that could possibly work at scale, then iterate

### Background Context
CIRA MVP addresses enterprise-scale invoice processing: converting 3,000+ daily PDF invoices to structured JSON data reliably and cost-effectively. The system targets mid-to-large organizations requiring high-volume processing without the complexity of enterprise software.

Built with scalable AWS serverless architecture (API Gateway + Lambda + Step Functions + PostgreSQL with auto-scaling), CIRA MVP handles enterprise volumes while maintaining simplicity. The 3-step workflow provides immediate value for high-volume customers while establishing foundation for iterative enhancement.

### Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-09-11 | 2.0 | MVP-focused PRD - simplified from v1.0 | John (PM Agent) |

## Requirements

### Functional Requirements

**FR1:** The system SHALL accept PDF invoice URLs via POST endpoint and return a job identifier within 5 seconds

**FR2:** The system SHALL process PDF invoices through Docling OCR with 5-minute timeout and basic retry

**FR3:** The system SHALL extract structured data using Azure OpenAI with simple default schema (vendor, amount, date, invoice number, line items)

**FR4:** The system SHALL provide job status via GET endpoint with states: queued → processing → completed/failed

**FR5:** The system SHALL store all job data in PostgreSQL database with JSONB for extracted data

**FR6:** The system SHALL implement simple API key authentication (not hashed for MVP)

**FR7:** The system SHALL track basic token usage for cost visibility

**FR8:** The system SHALL return structured JSON output with extracted data and confidence scores

### Non-Functional Requirements

**NFR1:** The system SHALL achieve 95% success rate for standard invoice formats

**NFR2:** The system SHALL complete processing within 2-minute average timeframe at enterprise scale

**NFR3:** The system SHALL support 125+ concurrent requests (peak hourly load) with auto-scaling

**NFR4:** The system SHALL maintain processing costs below $0.30 per invoice at volume pricing

**NFR7:** The system SHALL handle 3,000 invoices/day with 99.9% uptime during business hours

**NFR8:** The system SHALL auto-scale Lambda functions and database connections for peak loads

**NFR9:** The system SHALL implement queue-based processing to handle volume spikes

**NFR10:** The system SHALL provide basic monitoring for 3K+ daily volume tracking

## User Interface Design Goals

### Overall UX Vision
**API-first MVP** - No dashboard required for initial release. Clean, minimal API documentation with job monitoring capabilities through direct API calls.

### Key Interaction Paradigms
- **Direct API Usage:** All interactions through 3 core endpoints
- **Simple Status Polling:** Basic GET requests for job status updates
- **JSON-First Results:** Direct JSON responses for easy integration

### Core API Endpoints
- **POST /jobs** - Submit PDF for processing
- **GET /jobs/{id}/status** - Check processing status  
- **GET /jobs/{id}/result** - Retrieve extracted data

### Target Platforms
API-only service for MVP - web dashboard deferred to Phase 2

## Technical Assumptions

### Repository Structure: Monorepo
Single repository with minimal packages: `api/`, `database/`, `infrastructure/` only.

### Service Architecture
**Minimal Serverless:** API Gateway routes to Lambda functions, Step Functions manages 3-step workflow (OCR → Extract → Complete), PostgreSQL for all storage.

### Testing Requirements
**Focus on Critical Path:** Test happy path scenarios with basic integration tests for external services (Docling, OpenAI).

### Additional Technical Assumptions

**Simplified Technology Stack:**
- **Language:** TypeScript 5.6.2, Node.js 20.17.0
- **Framework:** Hono 4.6.3 for minimal API performance
- **Database:** PostgreSQL 16.4 only (no Redis/caching)
- **Infrastructure:** AWS CDK 2.158.0 with minimal constructs
- **HTTP Client:** Native Node.js fetch (zero dependencies)
- **Validation:** Basic input validation (no Zod)
- **Testing:** Vitest 2.1.x for speed
- **Monitoring:** CloudWatch only (basic console.log)

**External Services:**
- **OCR:** Docling API with basic timeout handling
- **LLM:** Azure OpenAI GPT-4-turbo with structured output
- **No fallback services initially** - keep it simple

**Removed Complexity:**
- ❌ Redis caching (PostgreSQL handles all storage)
- ❌ Complex error handling libraries
- ❌ ORM layers (direct SQL queries)
- ❌ Advanced monitoring and alerting
- ❌ Complex authentication (simple API keys)
- ❌ Dashboard/UI components

## Epic List

### Epic 1: Foundation & Scalable API Core
Establish AWS infrastructure with auto-scaling capabilities, database with connection pooling, and high-throughput job submission API endpoints.

### Epic 2: High-Volume Processing Pipeline
Implement Step Functions workflow with concurrent processing, Docling OCR integration, and queue-based job management for enterprise scale.

### Epic 3: Cost-Optimized LLM Integration
Add OpenAI GPT-4 extraction with volume-optimized prompts, batch processing capabilities, and detailed cost tracking for enterprise billing.

## Epic 1: Foundation & Scalable API Core

**Epic Goal:** Build the scalable foundation that can handle 3,000 jobs/day, with auto-scaling infrastructure and high-throughput job submission. This delivers immediate testable value with enterprise-ready performance characteristics.

### Story 1.1: Project Setup
As a **developer**,  
I want **basic monorepo with TypeScript and AWS CDK**,  
so that **I can build and deploy the MVP efficiently**.

#### Acceptance Criteria
1. Create packages structure: api/, database/, infrastructure/
2. Configure TypeScript with basic settings
3. Set up AWS CDK for infrastructure deployment  
4. Add Vitest for testing framework
5. Create basic deployment script
6. Document setup in README

### Story 1.2: Scalable AWS Infrastructure
As a **high-volume system**,  
I want **auto-scaling AWS services provisioned**,  
so that **the API can handle 3,000+ daily jobs reliably**.

#### Acceptance Criteria
1. Deploy PostgreSQL RDS with connection pooling and auto-scaling storage
2. Create API Gateway with rate limiting and Lambda integration 
3. Set up Step Functions with concurrent execution limits for high throughput
4. Configure CloudWatch logging with log retention for volume monitoring
5. Add Lambda reserved concurrency settings for predictable performance
6. Create auto-scaling policies for database connections and compute resources

### Story 1.3: Database Schema  
As a **data store**,  
I want **simple tables for jobs and results**,  
so that **I can persist job information reliably**.

#### Acceptance Criteria
1. Create jobs table (id, status, pdf_url, timestamps, error_message)
2. Create job_results table (job_id, extracted_data JSONB, confidence_score, tokens_used)
3. Create api_keys table (id, key_value, name, is_active)
4. Add basic indexes for performance
5. Create database connection utility
6. Add sample data for development

### Story 1.4: Core API Endpoints
As an **API client**,  
I want **job submission and status endpoints**,  
so that **I can submit PDFs and check processing status**.

#### Acceptance Criteria
1. Implement POST /jobs endpoint (accepts pdf_url, returns job_id)
2. Implement GET /jobs/{id}/status endpoint
3. Add basic input validation for PDF URLs
4. Store jobs with "queued" status in database
5. Return consistent JSON responses
6. Add health check endpoint
7. Add basic API key authentication middleware

### Story 1.5: Basic Job Management
As a **job system**,  
I want **simple job status tracking**,  
so that **status updates work correctly**.

#### Acceptance Criteria
1. Implement job status states: queued → processing → completed/failed
2. Create status update functions with error handling
3. Add job cleanup for old completed jobs (>90 days)
4. Implement basic timeout handling
5. Add status validation to prevent invalid transitions
6. Create job retrieval functions

## Epic 2: Processing Pipeline

**Epic Goal:** Transform the API foundation into a working OCR processor using Step Functions and Docling integration. This delivers the core processing capability with basic text extraction.

### Story 2.1: Step Functions Workflow
As a **processing orchestrator**,  
I want **simple 3-state workflow**,  
so that **jobs progress through OCR and completion reliably**.

#### Acceptance Criteria
1. Create Step Functions with states: StartOCR → ExtractData → Complete
2. Add Lambda triggers for each state
3. Implement basic error handling and retry (3 attempts)
4. Add execution logging to CloudWatch
5. Deploy state machine via CDK
6. Add job status updates during processing

### Story 2.2: PDF URL Processing
As a **PDF processor**,  
I want **reliable PDF access from URLs**,  
so that **I can process documents without local storage**.

#### Acceptance Criteria  
1. Validate PDF URL format and accessibility
2. Add PDF format validation before processing
3. Implement streaming PDF access (no local files)
4. Add basic security validation (prevent SSRF)
5. Set PDF size limits for processing efficiency
6. Add timeout handling for network requests
7. Log all PDF access attempts

### Story 2.3: Docling OCR Integration
As a **text extractor**,  
I want **working Docling OCR integration**,  
so that **I can convert PDF invoices to text**.

#### Acceptance Criteria
1. Implement Docling API client with authentication
2. Create PDF submission to Docling with proper formatting
3. Add OCR result polling with timeout (5 minutes)
4. Implement basic retry logic (exponential backoff)
5. Store OCR results in database
6. Add basic error handling for service failures
7. Log all Docling interactions

### Story 2.4: OCR Results Storage
As a **data manager**,  
I want **OCR text stored properly**,  
so that **extracted text is available for LLM processing**.

#### Acceptance Criteria
1. Store raw OCR text in job_results table
2. Add extraction metadata (confidence, processing time)
3. Update job status to "processing" during OCR
4. Add compression for large text extractions
5. Implement basic text validation
6. Create OCR result retrieval for debugging

## Epic 3: LLM Integration

**Epic Goal:** Add intelligent data extraction using OpenAI GPT-4, transforming OCR text into structured invoice data with basic cost tracking. This completes the MVP processing pipeline.

### Story 3.1: OpenAI Integration
As a **LLM processor**,  
I want **working OpenAI GPT-4 connection**,  
so that **I can extract structured data from OCR text**.

#### Acceptance Criteria
1. Configure Azure OpenAI connection with API key
2. Implement GPT-4 client with structured output mode
3. Add basic rate limiting and timeout handling
4. Create prompt template for invoice extraction
5. Add request/response logging for debugging
6. Implement basic error handling for API failures

### Story 3.2: Simple Invoice Schema
As a **data extractor**,  
I want **basic invoice field extraction**,  
so that **I can return structured invoice data**.

#### Acceptance Criteria
1. Define simple schema: vendor_name, invoice_number, invoice_date, total_amount, line_items
2. Create TypeScript interface for extracted data
3. Implement schema-based prompt for GPT-4
4. Add basic field validation
5. Store extracted data in JSONB column
6. Return confidence score with results

### Story 3.3: Data Extraction Processing  
As a **processing pipeline**,  
I want **LLM extraction in Step Functions**,  
so that **OCR text becomes structured data**.

#### Acceptance Criteria
1. Add LLM processing state to Step Functions
2. Create extraction Lambda function
3. Implement structured output parsing
4. Add extraction result validation
5. Store final results in database
6. Update job status to "completed"
7. Add basic token usage tracking

### Story 3.4: Results API Endpoint
As an **API client**,  
I want **GET /jobs/{id}/result endpoint**,  
so that **I can retrieve extracted invoice data**.

#### Acceptance Criteria
1. Implement GET /jobs/{id}/result endpoint
2. Return structured JSON with extracted data
3. Include confidence scores and metadata
4. Add basic cost information (tokens used)
5. Handle job not found and incomplete jobs
6. Add result validation before return

### Story 3.5: Basic Cost Tracking
As a **cost monitor**,  
I want **simple token usage tracking**,  
so that **I can understand processing costs**.

#### Acceptance Criteria
1. Track GPT-4 input and output tokens per job
2. Store token count in job_results table
3. Calculate approximate cost based on token usage
4. Add cost information to result endpoint
5. Implement basic cost logging
6. Add cost summary for completed jobs

## Next Steps

### MVP Implementation Phases

**Phase 1: Foundation (Week 1-2)**
- ✅ Build core API infrastructure
- ✅ Database and basic endpoints working
- ✅ Job submission and status checking

**Phase 2: Processing (Week 3-4)**  
- ✅ Step Functions workflow operational
- ✅ Docling OCR integration working
- ✅ Text extraction and storage

**Phase 3: Intelligence (Week 5-6)**
- ✅ OpenAI GPT-4 integration
- ✅ Structured data extraction
- ✅ Complete end-to-end processing

### Architect Prompt
This MVP PRD is aligned with the simplified architecture document. Key implementation guidance:

1. **Start Simple** - Use the minimal tech stack defined in architecture
2. **No Over-Engineering** - Stick to basic error handling and logging  
3. **Focus on Happy Path** - Get the core workflow working first
4. **Direct SQL** - No ORM complexity, use direct database queries
5. **Basic Testing** - Focus on integration tests for critical path

The MVP can process invoices end-to-end in 4-6 weeks, providing immediate customer value while establishing foundation for iterative enhancement.

**Success Criteria:**
- PDF URL → structured JSON data in <2 minutes
- 95% success rate on standard invoices  
- Cost transparency with token tracking
- Simple API that "just works"

Build this MVP first, learn from real usage, then add complexity based on customer feedback and proven need.