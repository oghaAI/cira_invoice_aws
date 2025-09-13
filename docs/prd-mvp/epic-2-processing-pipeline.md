# Epic 2: Processing Pipeline

**Epic Goal:** Transform the API foundation into a working OCR processor using Step Functions and Docling integration. This delivers the core processing capability with basic text extraction.

## Story 2.1: Step Functions Workflow
As a **processing orchestrator**,  
I want **simple 3-state workflow**,  
so that **jobs progress through OCR and completion reliably**.

### Acceptance Criteria
1. Create Step Functions with states: StartOCR → ExtractData → Complete
2. Add Lambda triggers for each state
3. Implement basic error handling and retry (3 attempts)
4. Add execution logging to CloudWatch
5. Deploy state machine via CDK
6. Add job status updates during processing

## Story 2.2: PDF URL Processing
As a **PDF processor**,  
I want **reliable PDF access from URLs**,  
so that **I can process documents without local storage**.

### Acceptance Criteria  
1. Validate PDF URL format and accessibility
2. Add PDF format validation before processing
3. Implement streaming PDF access (no local files)
4. Add basic security validation (prevent SSRF)
5. Set PDF size limits for processing efficiency
6. Add timeout handling for network requests
7. Log all PDF access attempts

## Story 2.3: Docling OCR Integration
As a **text extractor**,  
I want **working Docling OCR integration**,  
so that **I can convert PDF invoices to text**.

### Acceptance Criteria
1. Implement Docling API client with authentication
2. Create PDF submission to Docling with proper formatting
3. Add OCR result polling with timeout (5 minutes)
4. Implement basic retry logic (exponential backoff)
5. Store OCR results in database
6. Add basic error handling for service failures
7. Log all Docling interactions

## Story 2.4: OCR Results Storage
As a **data manager**,  
I want **OCR text stored properly**,  
so that **extracted text is available for LLM processing**.

### Acceptance Criteria
1. Store raw OCR text in job_results table
2. Add extraction metadata (confidence, processing time)
3. Update job status to "processing" during OCR
4. Add compression for large text extractions
5. Implement basic text validation
6. Create OCR result retrieval for debugging
