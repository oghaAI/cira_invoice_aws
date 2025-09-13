# REST API Spec

```yaml
openapi: 3.0.0
info:
  title: CIRA Invoice Processing API
  version: 1.0.0
  description: |
    CIRA provides AI-powered invoice processing with dual-LLM validation for 95%+ accuracy.
    Submit PDF URLs for processing and receive structured invoice data with cost transparency.
  contact:
    name: CIRA API Support
    url: https://docs.cira-invoice.com
servers:
  - url: https://api.cira-invoice.com/v1
    description: Production API server
  - url: https://staging-api.cira-invoice.com/v1
    description: Staging environment

security:
  - ApiKeyAuth: []

paths:
  /health:
    get:
      summary: Health check endpoint
      description: System health and status verification
      tags:
        - System
      security: []
      responses:
        '200':
          description: System is healthy
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    example: "healthy"
                  timestamp:
                    type: string
                    format: date-time
                  version:
                    type: string
                    example: "1.0.0"

  /jobs:
    post:
      summary: Submit invoice processing job
      description: |
        Submit a PDF invoice URL for processing. Returns immediately with job ID for status tracking.
        Processing typically completes within 2 minutes.
      tags:
        - Jobs
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - pdf_url
              properties:
                pdf_url:
                  type: string
                  format: uri
                  description: HTTPS URL to PDF invoice document
                  example: "https://example.com/invoices/INV-2024-001.pdf"
              example:
                pdf_url: "https://example.com/invoices/INV-2024-001.pdf"
      responses:
        '201':
          description: Job created successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  job_id:
                    type: string
                    description: Unique job identifier (NanoID format)
                    example: "V1StGXR8_Z5jdHi6B-myT"
                  status:
                    type: string
                    enum: ["queued"]
                    example: "queued"
                  created_at:
                    type: string
                    format: date-time
                    example: "2024-01-15T10:30:00Z"
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '429':
          $ref: '#/components/responses/RateLimited'

  /jobs/{job_id}/status:
    get:
      summary: Get job processing status
      description: |
        Retrieve current processing status and progress information.
        Status updates in real-time as job progresses through processing pipeline.
      tags:
        - Jobs
      parameters:
        - name: job_id
          in: path
          required: true
          schema:
            type: string
          description: Unique job identifier
          example: "V1StGXR8_Z5jdHi6B-myT"
      responses:
        '200':
          description: Job status retrieved successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  job_id:
                    type: string
                    example: "V1StGXR8_Z5jdHi6B-myT"
                  status:
                    type: string
                    enum: ["queued", "processing_ocr", "extracting_data", "verifying", "completed", "failed"]
                    example: "extracting_data"
                  created_at:
                    type: string
                    format: date-time
                    example: "2024-01-15T10:30:00Z"
                  updated_at:
                    type: string
                    format: date-time
                    example: "2024-01-15T10:31:45Z"
                  estimated_completion:
                    type: string
                    format: date-time
                    description: Estimated completion time (present during processing)
                    example: "2024-01-15T10:32:30Z"
                  processing_duration_ms:
                    type: integer
                    description: Current processing time in milliseconds
                    example: 105000
        '404':
          $ref: '#/components/responses/NotFound'
        '401':
          $ref: '#/components/responses/Unauthorized'

  /jobs/{job_id}/result:
    get:
      summary: Get extracted invoice data
      description: |
        Retrieve structured invoice data after successful processing.
        Only available when job status is 'completed'.
      tags:
        - Jobs
      parameters:
        - name: job_id
          in: path
          required: true
          schema:
            type: string
          description: Unique job identifier
          example: "V1StGXR8_Z5jdHi6B-myT"
      responses:
        '200':
          description: Invoice data extracted successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  job_id:
                    type: string
                    example: "V1StGXR8_Z5jdHi6B-myT"
                  status:
                    type: string
                    enum: ["completed"]
                  extracted_data:
                    $ref: '#/components/schemas/InvoiceData'
                  confidence_score:
                    type: number
                    format: float
                    minimum: 0.0
                    maximum: 1.0
                    description: Overall extraction confidence
                    example: 0.95
                  processing_duration_ms:
                    type: integer
                    example: 87500
                  completed_at:
                    type: string
                    format: date-time
                    example: "2024-01-15T10:31:27Z"
        '404':
          $ref: '#/components/responses/NotFound'
        '409':
          description: Job not yet completed
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
              example:
                error_code: "JOB_NOT_COMPLETED"
                message: "Job is still processing. Current status: extracting_data"
                suggested_action: "Poll /jobs/{job_id}/status until status is 'completed'"

  /jobs/{job_id}/cost:
    get:
      summary: Get job processing cost breakdown
      description: |
        Detailed cost attribution for processing operations including all external service charges.
        Available for jobs in any status for cost transparency.
      tags:
        - Jobs
      parameters:
        - name: job_id
          in: path
          required: true
          schema:
            type: string
          description: Unique job identifier
          example: "V1StGXR8_Z5jdHi6B-myT"
      responses:
        '200':
          description: Cost breakdown retrieved successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  job_id:
                    type: string
                    example: "V1StGXR8_Z5jdHi6B-myT"
                  total_cost:
                    type: number
                    format: decimal
                    description: Total processing cost in USD
                    example: 0.42
                  cost_breakdown:
                    type: object
                    properties:
                      ocr_processing:
                        type: number
                        format: decimal
                        example: 0.15
                      llm_extraction:
                        type: number
                        format: decimal
                        example: 0.23
                      infrastructure:
                        type: number
                        format: decimal
                        example: 0.04
                  external_service_costs:
                    type: object
                    properties:
                      docling_api:
                        type: number
                        format: decimal
                        example: 0.15
                      azure_openai:
                        type: object
                        properties:
                          input_tokens:
                            type: integer
                            example: 1250
                          output_tokens:
                            type: integer
                            example: 890
                          total_cost:
                            type: number
                            format: decimal
                            example: 0.23
        '404':
          $ref: '#/components/responses/NotFound'

components:
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key
      description: API key for authentication and usage tracking

  schemas:
    InvoiceData:
      type: object
      description: Structured invoice data extracted from PDF based on InvoiceSchema
      properties:
        invoice_date:
          type: string
          nullable: true
          description: The date the invoice was issued
          example: "2024-01-10"
        invoice_number:
          type: string
          nullable: true
          description: Invoice number is the unique number that identifies the invoice
          example: "INV-2024-001"
        invoice_due_date:
          type: string
          nullable: true
          description: The date by which the invoice should be paid
          example: "2024-02-10"
        invoice_past_due_amount:
          type: number
          nullable: true
          description: The outstanding amount from previous billing cycles
          example: 150.00
        invoice_current_due_amount:
          type: number
          nullable: true
          description: The amount due for the current billing cycle
          example: 1250.00
        invoice_late_fee_amount:
          type: number
          nullable: true
          description: Any fees applied for late payment
          example: 25.00
        credit_amount:
          type: number
          nullable: true
          description: Any credits applied to the invoice
          example: 50.00
        policy_number:
          type: string
          nullable: true
          description: The insurance policy number associated with the invoice
          example: "POL-2024-12345"
        account_number:
          type: string
          nullable: true
          description: The customer's account number
          example: "ACC-789456"
        policy_start_date:
          type: string
          nullable: true
          description: The start date of the policy period
          example: "2024-01-01"
        policy_end_date:
          type: string
          nullable: true
          description: The end date of the policy period
          example: "2024-12-31"
        service_start_date:
          type: string
          nullable: true
          description: The start date of the service period covered by the invoice
          example: "2024-01-01"
        service_end_date:
          type: string
          nullable: true
          description: The end date of the service period covered by the invoice
          example: "2024-01-31"
        payment_remittance_address:
          type: string
          nullable: true
          description: The address where the payment should be sent
          example: "PO Box 12345, Payment Processing, NY 10001"
        payment_remittance_entity:
          type: string
          nullable: true
          description: The entity to whom the payment should be made out
          example: "Acme Insurance Services"
        payment_remittance_entity_care_of:
          type: string
          nullable: true
          description: Any 'care of' information for the payment remittance entity
          example: "c/o Payment Department"
        reasoning:
          type: string
          nullable: true
          description: Explanation or reasoning for any decisions made during processing
          example: "Invoice clearly shows policy number and current due amount"
        community_name:
          type: string
          nullable: true
          description: The name of the community or property being serviced
          example: "Sunset Ridge Community"
        vendor_name:
          type: string
          nullable: true
          description: The name of the vendor providing the service
          example: "Acme Insurance Services"
        valid_input:
          type: boolean
          nullable: true
          description: Whether the input is clear, readable and processable
          example: true


    Error:
      type: object
      description: Standard error response format
      properties:
        error_code:
          type: string
          description: Machine-readable error identifier
          example: "INVALID_PDF_URL"
        message:
          type: string
          description: Human-readable error description
          example: "The provided PDF URL is not accessible or invalid"
        suggested_action:
          type: string
          description: Recommended corrective action
          example: "Verify the URL is publicly accessible and points to a valid PDF file"
        correlation_id:
          type: string
          description: Request correlation ID for debugging
          example: "req_abc123def456"

  responses:
    BadRequest:
      description: Invalid request parameters
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
          example:
            error_code: "INVALID_PDF_URL"
            message: "The provided PDF URL is not accessible or invalid"
            suggested_action: "Verify the URL is publicly accessible and points to a valid PDF file"

    Unauthorized:
      description: Invalid or missing API key
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
          example:
            error_code: "INVALID_API_KEY"
            message: "The provided API key is invalid or expired"
            suggested_action: "Check your API key and ensure it's included in the X-API-Key header"

    NotFound:
      description: Job not found
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
          example:
            error_code: "JOB_NOT_FOUND"
            message: "No job found with the specified ID"
            suggested_action: "Verify the job ID is correct and the job exists"

    RateLimited:
      description: Rate limit exceeded
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
          example:
            error_code: "RATE_LIMIT_EXCEEDED"
            message: "Too many requests. Rate limit: 60 requests per minute"
            suggested_action: "Wait before making additional requests or contact support for higher limits"
      headers:
        Retry-After:
          description: Seconds to wait before retrying
          schema:
            type: integer
            example: 60
```
