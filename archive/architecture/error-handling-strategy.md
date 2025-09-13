# Error Handling Strategy

## General Approach
- **Error Model:** Custom error classes with structured metadata and correlation IDs
- **Exception Hierarchy:** Base `CiraError` → Domain-specific errors (`OCRError`, `LLMError`, `ValidationError`)
- **Error Propagation:** Errors bubble up with context preservation, handled at API boundary

## Logging Standards
- **Library:** Winston 3.x with structured JSON output
- **Format:** JSON with correlation IDs, service context, and sanitized request data  
- **Levels:** ERROR (system issues), WARN (business logic issues), INFO (processing milestones), DEBUG (detailed flow)
- **Required Context:**
  - Correlation ID: UUID v4 format for request tracing
  - Service Context: Lambda function name, version, and execution context
  - User Context: API key ID (never the actual key), job ID, processing stage

## External API Error Handling
- **Retry Policy:** Step Functions built-in retry with exponential backoff
- **Timeout Configuration:** 5-minute timeout for OCR, 30-second timeout for LLM requests
- **Error Translation:** Map external service errors to standardized CIRA error codes
- **Failure Management:** Step Functions handles complex retry and failure scenarios

## Business Logic Error Handling
- **Custom Exceptions:** InvoiceProcessingError, ValidationError, ExtractionError
- **User-Facing Errors:** Structured error responses with actionable guidance
- **Error Codes:** Standardized machine-readable error codes (INVALID_PDF_URL, JOB_NOT_FOUND, etc.)

## Data Consistency
- **Transaction Strategy:** PostgreSQL ACID transactions for job state changes
- **Compensation Logic:** Step Functions retry and rollback mechanisms
- **Idempotency:** All processing operations idempotent with correlation IDs
