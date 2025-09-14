# Data Models

## Job Model

**Purpose:** Track invoice processing requests from submission to completion.

**Key Attributes:**
- `id`: string (simple UUID) - Job identifier
- `status`: enum - Current state (queued, processing, completed, failed)
- `pdf_url`: string - Source PDF URL
- `created_at`: timestamp - Creation time
- `updated_at`: timestamp - Last update
- `error_message`: string - Failure details (if any)

**Relationships:**
- Has one `JobResult` (when completed)

## JobResult Model

**Purpose:** Store extracted invoice data in simple JSON format.

**Key Attributes:**
- `job_id`: string - Reference to parent job
- `extracted_data`: JSONB - All extracted fields in flexible JSON
- `confidence_score`: decimal - Overall extraction confidence
- `tokens_used`: integer - Token consumption for cost tracking
- `created_at`: timestamp - Extraction completion time

**Relationships:**
- Belongs to one `Job`

## ApiKey Model

**Purpose:** Simple client authentication.

**Key Attributes:**
- `id`: string - Key identifier
- `key_value`: string - Actual API key (not hashed for MVP)
- `name`: string - Client-friendly name
- `is_active`: boolean - Enable/disable key
- `created_at`: timestamp - Creation time

**Relationships:**
- Referenced by `Jobs` for attribution
