# Data Models

## Job Model

**Purpose:** Represents a single invoice processing request from submission through completion, serving as the central entity that tracks the entire processing lifecycle.

**Key Attributes:**
- `id`: string (NanoID) - Unique job identifier for URL-safe references
- `status`: enum - Current processing state (queued, processing_ocr, extracting_data, verifying, completed, failed)
- `pdf_url`: string - Source URL of the PDF invoice to be processed
- `created_at`: timestamp - Job submission time for audit trail
- `updated_at`: timestamp - Last status change for monitoring
- `completed_at`: timestamp - Processing completion time for SLA tracking
- `processing_cost`: decimal - Total cost attribution for billing transparency
- `retry_count`: integer - Number of retry attempts for reliability tracking
- `error_message`: string - Failure reason for debugging and user feedback

**Relationships:**
- Has one `JobResult` (extracted invoice data)
- Has many `ProcessingEvents` (audit trail)
- Belongs to one `ApiKey` (client attribution)

## JobResult Model

**Purpose:** Stores the structured invoice data extracted by the LLM processing based on the fixed InvoiceSchema, including confidence scores and validation metadata.

**Key Attributes:**
- `job_id`: string - Foreign key to parent Job
- `invoice_date`: date - Invoice issue date (nullable)
- `invoice_number`: string - Unique invoice identifier (nullable)
- `invoice_due_date`: date - Payment due date (nullable)
- `invoice_past_due_amount`: decimal - Outstanding amount from previous cycles (nullable)
- `invoice_current_due_amount`: decimal - Current billing cycle amount due (nullable)
- `invoice_late_fee_amount`: decimal - Late payment fees (nullable)
- `credit_amount`: decimal - Credits applied to invoice (nullable)
- `policy_number`: string - Insurance policy number (nullable)
- `account_number`: string - Customer account/property ID (nullable)
- `policy_start_date`: date - Policy period start (nullable)
- `policy_end_date`: date - Policy period end (nullable)
- `service_start_date`: date - Service period start (nullable)
- `service_end_date`: date - Service period end (nullable)
- `payment_remittance_address`: text - Payment address (nullable)
- `payment_remittance_entity`: string - Payment entity name (nullable)
- `payment_remittance_entity_care_of`: string - Care of information (nullable)
- `reasoning`: text - LLM processing reasoning (nullable)
- `community_name`: string - Community/property name (nullable)
- `vendor_name`: string - Service provider name (nullable)
- `valid_input`: boolean - Input clarity and processability flag (nullable)
- `confidence_score`: decimal - Overall extraction confidence (0.0-1.0)
- `raw_ocr_text`: text - Original OCR output for validation
- `llm_tokens_used`: integer - Token consumption for cost tracking
- `additional_data`: JSONB - Future extensibility for custom fields

**Relationships:**
- Belongs to one `Job`


## ApiKey Model

**Purpose:** Manages client authentication and usage tracking for billing and access control.

**Key Attributes:**
- `id`: string - Internal key identifier
- `key_hash`: string - Hashed API key for secure storage
- `name`: string - Client-friendly key name
- `created_at`: timestamp - Key creation time
- `last_used_at`: timestamp - Recent usage tracking
- `is_active`: boolean - Key enablement status
- `usage_count`: integer - Total requests made
- `monthly_usage`: integer - Current month request count
- `rate_limit`: integer - Requests per minute limit

**Relationships:**
- Has many `Jobs` (usage attribution)
- Has many `UsageEvents` (detailed tracking)

## ProcessingEvent Model

**Purpose:** Provides comprehensive audit trail for job processing steps, costs, and system interactions.

**Key Attributes:**
- `job_id`: string - Foreign key to Job
- `event_type`: enum - Type of processing event (status_change, external_api_call, error_occurred)
- `timestamp`: timestamp - Event occurrence time
- `details`: JSON - Event-specific metadata and context
- `cost_incurred`: decimal - Cost associated with this processing step
- `external_service`: string - Which external API was called (docling, openai)
- `duration_ms`: integer - Processing time for performance tracking

**Relationships:**
- Belongs to one `Job`
