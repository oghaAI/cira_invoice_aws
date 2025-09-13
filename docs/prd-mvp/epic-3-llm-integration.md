# Epic 3: LLM Integration

**Epic Goal:** Add intelligent data extraction using OpenAI GPT-4, transforming OCR text into structured invoice data with basic cost tracking. This completes the MVP processing pipeline.

## Story 3.1: OpenAI Integration
As a **LLM processor**,  
I want **working OpenAI GPT-4 connection**,  
so that **I can extract structured data from OCR text**.

### Acceptance Criteria
1. Configure Azure OpenAI connection with API key
2. Implement GPT-4 client with structured output mode
3. Add basic rate limiting and timeout handling
4. Create prompt template for invoice extraction
5. Add request/response logging for debugging
6. Implement basic error handling for API failures

## Story 3.2: Simple Invoice Schema
As a **data extractor**,  
I want **basic invoice field extraction**,  
so that **I can return structured invoice data**.

### Acceptance Criteria
1. Define simple schema: vendor_name, invoice_number, invoice_date, total_amount, line_items
2. Create TypeScript interface for extracted data
3. Implement schema-based prompt for GPT-4
4. Add basic field validation
5. Store extracted data in JSONB column
6. Return confidence score with results

## Story 3.3: Data Extraction Processing  
As a **processing pipeline**,  
I want **LLM extraction in Step Functions**,  
so that **OCR text becomes structured data**.

### Acceptance Criteria
1. Add LLM processing state to Step Functions
2. Create extraction Lambda function
3. Implement structured output parsing
4. Add extraction result validation
5. Store final results in database
6. Update job status to "completed"
7. Add basic token usage tracking

## Story 3.4: Results API Endpoint
As an **API client**,  
I want **GET /jobs/{id}/result endpoint**,  
so that **I can retrieve extracted invoice data**.

### Acceptance Criteria
1. Implement GET /jobs/{id}/result endpoint
2. Return structured JSON with extracted data
3. Include confidence scores and metadata
4. Add basic cost information (tokens used)
5. Handle job not found and incomplete jobs
6. Add result validation before return

## Story 3.5: Basic Cost Tracking
As a **cost monitor**,  
I want **simple token usage tracking**,  
so that **I can understand processing costs**.

### Acceptance Criteria
1. Track GPT-4 input and output tokens per job
2. Store token count in job_results table
3. Calculate approximate cost based on token usage
4. Add cost information to result endpoint
5. Implement basic cost logging
6. Add cost summary for completed jobs
