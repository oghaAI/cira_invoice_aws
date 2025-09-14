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

## Story 2.3: Provider-Agnostic PDF→Markdown OCR
As a **text extractor**,  
I want **a provider-agnostic OCR adapter that converts PDFs to Markdown**,  
so that **PDF invoices are converted to Markdown regardless of OCR provider**.

### Acceptance Criteria
1. Define a generic OCR provider interface (single entrypoint) that accepts a PDF by URL/stream and returns Markdown plus basic metadata (e.g., pages if available, processing time).
2. Implement at least one concrete adapter behind the interface (can be any OCR API or a mock), selected via configuration (e.g., environment variable) without changing call sites.
3. Ensure output is Markdown with reasonable structure preservation (headings, lists, tables when possible) and UTF-8 safe text.
4. Support both synchronous and asynchronous provider flows with polling and a 5-minute timeout; include exponential backoff retries on transient errors.
5. Map provider-specific errors to unified error categories (validation, auth, quota, timeout, server) and propagate meaningful messages.
6. Emit structured logs for all provider interactions (provider name, request id, duration, bytes/pages processed) without leaking sensitive data.
7. Persist the returned Markdown and metadata via the existing pipeline step for storage.

## Story 2.4: OCR Results Storage
As a **data manager**,  
I want **OCR text stored properly**,  
so that **extracted text is available for LLM processing**.

### Acceptance Criteria
1. Store raw OCR text in job_results table
2. Add extraction metadata (processing time and pages, if available)
3. Update job status to "processing" during OCR
4. Enforce size caps for stored OCR text (e.g., 1 MB) and truncate retrieval responses by default (e.g., 256 KB)
5. Implement basic text validation
6. Create OCR result retrieval for debugging
