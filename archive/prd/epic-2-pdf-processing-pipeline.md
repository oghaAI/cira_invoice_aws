# Epic 2: PDF Processing Pipeline

**Epic Goal:** Implement the core PDF processing workflow that ingests PDF URLs, performs OCR extraction through Docling service, manages processing states via Step Functions, and stores extracted text data. This epic transforms the foundational system into a working OCR processing pipeline that can handle PDF documents and manage complex workflows, delivering the essential processing capability before adding LLM intelligence.

## Story 2.1: Step Functions Workflow Implementation
As a **system architect**,  
I want **a Step Functions state machine orchestrating the PDF processing workflow**,  
so that **processing jobs follow a reliable, monitored sequence with proper error handling and state management**.

### Acceptance Criteria
1. Design Step Functions state machine with states: StartProcessing → OCRExtraction → UpdateStatus → CompletedSuccess/CompletedFailure
2. Implement Lambda function triggers for each processing state
3. Add error handling and retry logic with exponential backoff
4. Configure state machine execution logging to CloudWatch
5. Add timeout handling for long-running OCR operations
6. Implement state machine input/output data transformation
7. Create state machine deployment via AWS CDK infrastructure code
8. Add Step Functions execution monitoring and alerting

## Story 2.2: PDF URL Processing and Validation  
As a **processing system**,  
I want **robust PDF URL handling and validation**,  
so that **I can reliably access and process PDF documents from various sources without security vulnerabilities**.

### Acceptance Criteria
1. Implement URL validation for supported protocols (HTTP/HTTPS) and file extensions
2. Add URL accessibility testing with timeout and retry mechanisms
3. Implement PDF format validation before processing
4. Add security validation to prevent SSRF attacks and malicious URLs
5. Create PDF streaming functionality to avoid local file storage
6. Implement PDF size validation and limits for processing efficiency
7. Add comprehensive error handling for network timeouts and invalid files
8. Log all PDF access attempts and validation results for monitoring

## Story 2.3: Docling OCR Service Integration
As a **processing pipeline**,  
I want **reliable integration with Docling OCR service**,  
so that **I can extract text content from PDF invoices with proper error handling and quality validation**.

### Acceptance Criteria
1. Implement Docling API client with authentication and rate limiting
2. Create PDF submission workflow to Docling with proper request formatting
3. Add OCR processing status polling with configurable intervals
4. Implement 5-minute timeout with exponential backoff retry logic
5. Add OCR result validation and quality assessment
6. Create error handling for service unavailability and processing failures
7. Implement structured logging for all Docling API interactions
8. Add OCR result storage in database with extraction metadata

## Story 2.4: Job Processing State Management
As a **job processing system**,  
I want **comprehensive job state management throughout the processing pipeline**,  
so that **clients can track progress and the system maintains data integrity during complex workflows**.

### Acceptance Criteria
1. Update job status to "processing_ocr" when OCR processing begins
2. Implement database transactions for atomic state updates
3. Add processing timestamps and duration tracking for performance monitoring
4. Create job progress indicators with percentage completion estimates
5. Implement failure state handling with detailed error messages and recovery options
6. Add job cancellation capability for user-requested stops
7. Create job retry mechanisms for transient failures
8. Update Redis cache consistently with database state changes

## Story 2.5: Text Extraction Results Storage
As a **data management system**,  
I want **structured storage of OCR extraction results**,  
so that **extracted text data is available for subsequent LLM processing and audit purposes**.

### Acceptance Criteria
1. Create database schema for storing raw OCR text output with metadata
2. Implement text extraction result validation and sanitization
3. Add extraction confidence scores and quality metrics storage
4. Create data compression for large text extractions to optimize storage
5. Implement extraction result retrieval API for debugging and review
6. Add text preprocessing for common OCR artifacts and noise removal
7. Create backup storage mechanism for extraction results
8. Implement data retention policies aligned with business requirements
