# CIRA Invoice Processing API Usage Guide

## Overview

The CIRA Invoice Processing API provides a serverless, AI-powered solution for extracting structured data from PDF invoices. The system processes invoices through a 3-stage workflow: OCR → LLM Extraction → Storage.

## Base URL

```
https://nldl5jl1x6.execute-api.us-east-1.amazonaws.com/dev
```

## Authentication

All endpoints (except health check) require API key authentication via the `X-API-Key` header.

**Default API Key:**
```
Mwaf64Bevy7Jl7ynOtsCK2St9GHpqHbya3Ct2HVs
```

## Quick Start

```bash
# Set your environment variables
export API_BASE_URL="https://nldl5jl1x6.execute-api.us-east-1.amazonaws.com/dev"
export API_KEY="Mwaf64Bevy7Jl7ynOtsCK2St9GHpqHbya3Ct2HVs"

# 1. Submit an invoice for processing
curl -X POST "${API_BASE_URL}/jobs" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${API_KEY}" \
  -d '{"pdf_url": "https://example.com/invoice.pdf"}'

# Response:
# {
#   "job_id": "123e4567-e89b-12d3-a456-426614174000",
#   "status": "queued",
#   "created_at": "2025-01-12T10:30:00Z"
# }
```

## API Endpoints

### 1. Health Check

**Endpoint:** `GET /`

**Authentication:** Not required

**Description:** Check system health and version

**Example:**
```bash
curl "${API_BASE_URL}/"
```

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2025-01-12T10:30:00Z",
  "database": "connected"
}
```

---

### 2. Submit Invoice for Processing

**Endpoint:** `POST /jobs`

**Authentication:** Required (`X-API-Key` header)

**Description:** Submit a PDF invoice URL for processing. Returns immediately with a job ID for tracking.

**Request Body:**
```json
{
  "pdf_url": "https://example.com/invoice.pdf"
}
```

**Validation Rules:**
- `pdf_url` is required
- Must be a valid HTTPS URL
- Maximum length: 2048 characters

**Example:**
```bash
curl -X POST "${API_BASE_URL}/jobs" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${API_KEY}" \
  -d '{
    "pdf_url": "https://example.com/invoice.pdf"
  }'
```

**Response (201 Created):**
```json
{
  "job_id": "123e4567-e89b-12d3-a456-426614174000",
  "status": "queued",
  "created_at": "2025-01-12T10:30:00Z"
}
```

**Error Responses:**
- `400 Bad Request`: Missing or invalid `pdf_url`
- `401 Unauthorized`: Invalid or missing API key

---

### 3. Get Job Status

**Endpoint:** `GET /jobs/{jobId}/status`

**Authentication:** Required (`X-API-Key` header)

**Description:** Check the current processing status of a job. Use this endpoint to poll for completion.

**Path Parameters:**
- `jobId` (required): UUID of the job

**Example:**
```bash
curl -X GET "${API_BASE_URL}/jobs/123e4567-e89b-12d3-a456-426614174000/status" \
  -H "X-API-Key: ${API_KEY}"
```

**Response (200 OK) - Queued:**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "status": "queued",
  "created_at": "2025-01-12T10:30:00Z",
  "updated_at": "2025-01-12T10:30:00Z"
}
```

**Response (200 OK) - Processing:**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "status": "processing",
  "phase": "analyzing_invoice",
  "phase_label": "Analyzing invoice",
  "created_at": "2025-01-12T10:30:00Z",
  "updated_at": "2025-01-12T10:31:00Z"
}
```

**Response (200 OK) - Completed:**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "status": "completed",
  "created_at": "2025-01-12T10:30:00Z",
  "updated_at": "2025-01-12T10:35:00Z",
  "completed_at": "2025-01-12T10:35:00Z"
}
```

**Response (200 OK) - Failed:**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "status": "failed",
  "created_at": "2025-01-12T10:30:00Z",
  "updated_at": "2025-01-12T10:32:00Z"
}
```

**Status Values:**
- `queued`: Job created, waiting to start processing
- `processing`: Job is being processed (check `phase` for details)
- `completed`: Processing finished successfully
- `failed`: Processing encountered an error

**Processing Phases:**
- `analyzing_invoice`: Classifying invoice type
- `extracting_data`: Extracting structured data using LLM
- `verifying_data`: Validating extracted data

**Error Responses:**
- `400 Bad Request`: Invalid job ID format
- `404 Not Found`: Job not found or access denied

---

### 4. Get Job Details

**Endpoint:** `GET /jobs/{jobId}`

**Authentication:** Required (`X-API-Key` header)

**Description:** Retrieve complete job information including all metadata

**Example:**
```bash
curl -X GET "${API_BASE_URL}/jobs/123e4567-e89b-12d3-a456-426614174000" \
  -H "X-API-Key: ${API_KEY}"
```

**Response (200 OK):**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "clientId": "api-key-id",
  "status": "completed",
  "pdfUrl": "https://example.com/invoice.pdf",
  "createdAt": "2025-01-12T10:30:00Z",
  "updatedAt": "2025-01-12T10:35:00Z",
  "completedAt": "2025-01-12T10:35:00Z",
  "errorMessage": null
}
```

---

### 5. Get Extraction Results

**Endpoint:** `GET /jobs/{jobId}/result`

**Authentication:** Required (`X-API-Key` header)

**Description:** Retrieve extracted invoice data from a completed job. Only available when job status is `completed`.

**Example:**
```bash
curl -X GET "${API_BASE_URL}/jobs/123e4567-e89b-12d3-a456-426614174000/result" \
  -H "X-API-Key: ${API_KEY}"
```

**Response (200 OK):**
```json
{
  "job_id": "123e4567-e89b-12d3-a456-426614174000",
  "extracted_data": {
    "vendor_name": {
      "value": "Acme Corp",
      "confidence": "high",
      "reason_code": "explicit_label",
      "evidence_snippet": "Vendor: Acme Corp"
    },
    "invoice_number": {
      "value": "INV-2024-001",
      "confidence": "high",
      "reason_code": "explicit_label"
    },
    "invoice_date": {
      "value": "2024-01-10",
      "confidence": "high",
      "reason_code": "explicit_label"
    },
    "total_amount_due": {
      "value": 1250.00,
      "confidence": "high",
      "reason_code": "explicit_label"
    },
    "invoice_type": {
      "value": "general",
      "confidence": "high"
    }
  },
  "confidence_score": 0.95,
  "tokens_used": 1500,
  "raw_ocr_markdown": "# Invoice\n\nVendor: Acme Corp\n..."
}
```

**Response Fields:**
- `job_id`: UUID of the job
- `extracted_data`: Structured invoice data with confidence scores
- `confidence_score`: Overall confidence (0.0 - 1.0)
- `tokens_used`: Number of LLM tokens consumed
- `raw_ocr_markdown`: Raw OCR text from the PDF

**Error Responses:**
- `400 Bad Request`: Invalid job ID format
- `404 Not Found`: Job not found, not completed, or access denied

---

### 6. Get OCR Text

**Endpoint:** `GET /jobs/{jobId}/ocr`

**Authentication:** Required (`X-API-Key` header)

**Description:** Retrieve raw OCR text extracted from the PDF. By default, text is truncated to 256KB. Use `?raw=true` to get full text.

**Query Parameters:**
- `raw` (optional): Set to `true` to retrieve full OCR text without truncation

**Example - Truncated (default):**
```bash
curl -X GET "${API_BASE_URL}/jobs/123e4567-e89b-12d3-a456-426614174000/ocr" \
  -H "X-API-Key: ${API_KEY}"
```

**Example - Full Text:**
```bash
curl -X GET "${API_BASE_URL}/jobs/123e4567-e89b-12d3-a456-426614174000/ocr?raw=true" \
  -H "X-API-Key: ${API_KEY}"
```

**Response (200 OK):**
```json
{
  "job_id": "123e4567-e89b-12d3-a456-426614174000",
  "provider": "mistral",
  "duration_ms": 2500,
  "pages": 2,
  "raw_ocr_text": "# Invoice\n\nVendor: Acme Corp\n...",
  "truncated": false
}
```

**Response Fields:**
- `job_id`: UUID of the job
- `provider`: OCR provider used (e.g., "mistral")
- `duration_ms`: OCR processing time in milliseconds
- `pages`: Number of pages processed
- `raw_ocr_text`: OCR text (may be truncated)
- `truncated`: Whether the text was truncated

**Error Responses:**
- `400 Bad Request`: Invalid job ID format
- `404 Not Found`: Job or OCR results not found, or access denied

---

## Complete Workflow Example

Here's a complete example showing the full invoice processing workflow:

```bash
#!/bin/bash

# Configuration
export API_BASE_URL="https://nldl5jl1x6.execute-api.us-east-1.amazonaws.com/dev"
export API_KEY="Mwaf64Bevy7Jl7ynOtsCK2St9GHpqHbya3Ct2HVs"
export PDF_URL="https://example.com/invoice.pdf"

# Step 1: Submit invoice for processing
echo "Submitting invoice..."
RESPONSE=$(curl -s -X POST "${API_BASE_URL}/jobs" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${API_KEY}" \
  -d "{\"pdf_url\": \"${PDF_URL}\"}")

# Extract job_id
JOB_ID=$(echo $RESPONSE | jq -r '.job_id')
echo "Job ID: ${JOB_ID}"

# Step 2: Poll for status (every 5 seconds)
echo "Waiting for processing to complete..."
while true; do
  STATUS_RESPONSE=$(curl -s -X GET "${API_BASE_URL}/jobs/${JOB_ID}/status" \
    -H "X-API-Key: ${API_KEY}")
  
  STATUS=$(echo $STATUS_RESPONSE | jq -r '.status')
  PHASE=$(echo $STATUS_RESPONSE | jq -r '.phase_label // "Processing"')
  
  echo "Status: ${STATUS} - ${PHASE}"
  
  if [ "$STATUS" = "completed" ]; then
    echo "Processing completed!"
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "Processing failed!"
    exit 1
  fi
  
  sleep 5
done

# Step 3: Get extraction results
echo "Retrieving results..."
curl -X GET "${API_BASE_URL}/jobs/${JOB_ID}/result" \
  -H "X-API-Key: ${API_KEY}" | jq
```

## Error Handling

### Common Error Codes

| Status Code | Error Code | Description |
|------------|------------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid request (missing/invalid `pdf_url`, invalid job ID format) |
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 404 | `NOT_FOUND` | Job not found, not completed, or access denied |
| 405 | `METHOD_NOT_ALLOWED` | HTTP method not supported |
| 500 | `INTERNAL_SERVER_ERROR` | Server error occurred |

### Error Response Format

```json
{
  "error_code": "VALIDATION_ERROR",
  "message": "pdf_url is required"
}
```

## Rate Limits

- **Burst Limit:** 50 requests
- **Rate Limit:** 100 requests per minute
- **Monthly Quota:** 100,000 requests (dev environment)

## Processing Time

Typical processing times:
- **OCR Stage:** 2-5 seconds per page
- **LLM Extraction:** 5-15 seconds
- **Total:** Usually completes within 2 minutes

## Best Practices

1. **Polling Strategy:** Poll `/jobs/{id}/status` every 5-10 seconds. Don't poll more frequently than every 2 seconds.

2. **Error Handling:** Always check the `status` field. If status is `failed`, check job details for `errorMessage`.

3. **Timeout:** Set a reasonable timeout (e.g., 5 minutes) for the entire workflow.

4. **PDF URLs:** Ensure PDF URLs are:
   - Accessible via HTTPS
   - Publicly accessible (no authentication required)
   - Valid PDF files

5. **API Key Security:** Never commit API keys to version control. Use environment variables or secrets management.

## Field Confidence Levels

Each extracted field includes a confidence level:

- **`high`**: Field was explicitly labeled in the invoice (most reliable)
- **`medium`**: Field inferred from nearby context or layout
- **`low`**: Field is ambiguous or missing

## Reason Codes

Each field includes a `reason_code` explaining how it was extracted:

- **`explicit_label`**: Field had an explicit label (e.g., "Invoice Date:")
- **`nearby_header`**: Field found near a header or label
- **`inferred_layout`**: Field inferred from document layout
- **`conflict`**: Multiple conflicting values found
- **`missing`**: Field not found in the document

## Support

For issues or questions:
- Check CloudWatch logs for detailed error information
- Review the API specification: `docs/api-spec.yaml`
- Check job status and error messages via the API

## Version

API Version: `1.0.0`

Last Updated: 2025-01-12

