# Components

## API Gateway Component

**Responsibility:** Route requests and basic authentication

**Key Interfaces:**
- POST /jobs - Create new processing job
- GET /jobs/{id}/status - Get job status
- GET /jobs/{id}/result - Get extraction results

**Dependencies:** Lambda functions

**Technology Stack:** AWS API Gateway V2, basic Lambda integration

## Job Management Service

**Responsibility:** Core job lifecycle management

**Key Interfaces:**
- createJob(pdfUrl, apiKey): Job
- getJobStatus(jobId): JobStatus
- getJobResult(jobId): JobResult

**Dependencies:** PostgreSQL database

**Technology Stack:** Lambda + Hono, direct SQL queries

## Step Functions Orchestrator

**Responsibility:** Coordinate 3-step processing workflow

**Key Interfaces:**
- Start processing workflow
- Handle state transitions
- Basic error handling

**Dependencies:** OCR and LLM Lambda functions

**Technology Stack:** AWS Step Functions with simple JSON definition

## OCR Processing Service

**Responsibility:** Extract text from PDFs via Docling

**Key Interfaces:**
- processDocument(pdfUrl): OCRText
- Simple error handling

**Dependencies:** Docling API

**Technology Stack:** Lambda + Hono, native fetch

## LLM Extraction Service

**Responsibility:** Extract structured data from OCR text

**Key Interfaces:**
- extractInvoiceData(ocrText): StructuredData
- Basic token counting

**Dependencies:** Azure OpenAI API

**Technology Stack:** Lambda + Hono, native fetch
