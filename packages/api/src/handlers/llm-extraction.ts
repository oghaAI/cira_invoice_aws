/**
 * @fileoverview LLM Extraction Lambda Handler
 *
 * This module implements the final stage of the CIRA Invoice Processing System,
 * responsible for extracting structured data from OCR text using Azure OpenAI
 * with a two-stage extraction pipeline.
 *
 * Key Responsibilities:
 * - Retrieve OCR text from database (stored by OCR processing stage)
 * - Stage 1: Classify invoice type (general, insurance, utility, tax)
 * - Stage 2: Extract type-specific structured fields using Azure OpenAI
 * - Validate extracted data against Zod schema
 * - Calculate confidence scores based on field weights
 * - Persist extraction results to database
 * - Return structured payload for Step Functions completion
 *
 * Processing Flow:
 * 1. Validate input contains jobId and OCR metadata
 * 2. Load OCR text from database using jobId
 * 3. Two-stage extraction:
 *    a. Classify invoice type using InvoiceTypeSchema
 *    b. Extract structured data using InvoiceSchema with type context
 * 4. Validate extraction results and calculate confidence
 * 5. Persist results including invoice type and token usage
 * 6. Return completion payload with metadata
 *
 * Integration Features:
 * - Two-stage LLM extraction for improved accuracy
 * - Azure OpenAI integration via AI SDK v5
 * - Zod schema validation for type safety
 * - Type-aware field extraction
 * - Weighted confidence calculation
 * - Token usage tracking for cost monitoring (both stages)
 * - Comprehensive error handling and logging
 *
 * @version 2.0.0
 * @author CIRA Development Team
 * @since 2025-10-01
 */

// IMPORTANT: Import instrumentation FIRST to initialize Langfuse before any other imports
import '../instrumentation';

import { extractInvoiceWithTypeDetection } from '../services/llm/client';
import { getSharedDatabaseClient } from '@cira/database';
import { flushSpans, langfuse } from '../instrumentation';

/**
 * Returns current timestamp in milliseconds for performance measurement.
 * @returns {number} Current time in milliseconds since Unix epoch
 */
function now() {
  return Date.now();
}

/**
 * Retrieves database credentials from AWS Secrets Manager or environment variables.
 *
 * This function provides flexible credential retrieval with multiple fallback options:
 * 1. Direct environment variables (DB_USER, DB_PASSWORD) for local development
 * 2. AWS Secrets Manager for production environments
 * 3. Graceful fallback for missing credentials
 *
 * @returns {Promise<{user?: string, password?: string}>} Database credentials object
 *
 * @example
 * ```typescript
 * const creds = await getDbCredentials();
 * if (creds.user && creds.password) {
 *   dbConfig.user = creds.user;
 *   dbConfig.password = creds.password;
 * }
 * ```
 */
async function getDbCredentials() {
  const secretArn = process.env['DATABASE_SECRET_ARN'];
  // Fallback to explicit envs if provided
  const envUser = process.env['DB_USER'];
  const envPassword = process.env['DB_PASSWORD'];
  if (envUser || envPassword) {
    return { user: envUser, password: envPassword } as { user?: string; password?: string };
  }
  if (!secretArn) return { user: undefined, password: undefined };
  // Lazy import AWS SDK v3 to avoid loading in unit tests
  const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
  const client = new SecretsManagerClient({});
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const secretString = res.SecretString ?? Buffer.from(res.SecretBinary ?? '').toString('utf8');
  try {
    const parsed = JSON.parse(secretString || '{}');
    return { user: parsed.username, password: parsed.password } as { user?: string; password?: string };
  } catch {
    return { user: undefined, password: undefined };
  }
}

/**
 * Main Lambda handler for LLM-based invoice data extraction.
 *
 * This function serves as the final processing stage in the invoice workflow,
 * taking OCR text and extracting structured invoice data using Azure OpenAI.
 * It handles the complete extraction pipeline from text input to validated results.
 *
 * Input Event Structure:
 * - jobId: UUID of the job to process
 * - ocr: OCR metadata from the previous processing stage
 *   - Can be either { metadata: {...} } or { ocr: { metadata: {...} } }
 *
 * Processing Steps:
 * 1. Validate input parameters (jobId, OCR metadata)
 * 2. Retrieve OCR text from database
 * 3. Extract structured data using AI SDK and InvoiceSchema
 * 4. Validate extraction results
 * 5. Persist results with confidence scores and token usage
 * 6. Return structured payload for Step Functions
 *
 * @param {any} event - Step Functions event containing jobId and OCR metadata
 * @returns {Promise<object>} Extraction results with metadata for Step Functions
 *
 * @throws {Error} LLM_EXTRACTION_ERROR prefixed errors for Step Functions error handling
 *
 * @example
 * ```typescript
 * const result = await handler({
 *   jobId: 'uuid-here',
 *   ocr: { metadata: { provider: 'mistral', pages: 2 } }
 * });
 * // Returns: { jobId, status: 'llm_completed', result: { extractedData, invoiceType, confidence, tokensUsed }, metadata: {...} }
 * ```
 */
export const handler = async (event: any) => {
  const t0 = now();
  const jobId = event?.jobId ?? null;
  const ocr = event?.ocr;
  // Support both shapes from Step Functions:
  // A) { ocr: { metadata: {...} } }
  // B) { ocr: { ocr: { metadata: {...} }, status, jobId } }
  const ocrMetadata = ocr?.metadata ?? ocr?.ocr?.metadata;

  /**
   * Structured logging function for CloudWatch integration.
   * Automatically includes jobId, duration, and timestamp for all log entries.
   *
   * @param {Record<string, unknown>} fields - Additional log fields
   */
  const log = (fields: Record<string, unknown>) => {
    const base = { timestamp: new Date().toISOString(), jobId, durationMs: now() - t0, ...fields };
    console.log(JSON.stringify(base));
  };

  // Create top-level Langfuse trace for this Lambda invocation
  const trace = langfuse?.trace({
    name: 'invoice-llm-extraction',
    userId: jobId,
    sessionId: jobId,
    metadata: {
      ocrProvider: ocrMetadata?.provider,
      ocrPages: ocrMetadata?.pages
    },
    tags: ['lambda', 'llm-extraction', 'invoice-processing']
  });

  try {
    // Validate input contains { jobId, ocr: { metadata } }
    if (!jobId) {
      log({ decision: 'VALIDATION', reason: 'missing_jobId' });
      throw new Error('Missing jobId');
    }
    if (!ocrMetadata) {
      log({ decision: 'VALIDATION', reason: 'missing_ocr_metadata' });
      throw new Error('OCR metadata missing');
    }

    // Build database configuration
    // Priority: DATABASE_URL (external DB like Supabase) > RDS with secrets
    const dbConfig: any = process.env['DATABASE_URL']
      ? { connectionString: process.env['DATABASE_URL'], ssl: { rejectUnauthorized: false } }
      : await (async () => {
          const creds = await getDbCredentials();
          const config: any = { ssl: true };
          if (process.env['DATABASE_PROXY_ENDPOINT']) config.host = process.env['DATABASE_PROXY_ENDPOINT'];
          if (process.env['DATABASE_NAME']) config.database = process.env['DATABASE_NAME'];
          if (creds.user) config.user = creds.user;
          if (creds.password) config.password = creds.password;
          return config;
        })();

    const db = getSharedDatabaseClient(dbConfig);

    try {
      // Load OCR text from database (stored by OCR processing step)
      const jobResult = await db.getJobResult(jobId);
      if (!jobResult || !jobResult.rawOcrText) {
        log({ decision: 'VALIDATION', reason: 'no_ocr_text' });
        throw new Error('No OCR text available');
      }

      // Invoke two-stage extraction: classify type, then extract fields
      const extractionResult = await extractInvoiceWithTypeDetection(jobResult.rawOcrText);

      // Validate extraction result (required fields present)
      if (!extractionResult.data) {
        log({ decision: 'VALIDATION', reason: 'no_extracted_data' });
        throw new Error('Extraction produced no data');
      }

      // On success: persist result with DatabaseClient.upsertJobResult
      await db.upsertJobResult({
        jobId,
        extractedData: extractionResult.data,
        confidenceScore: extractionResult.confidence ?? null,
        tokensUsed: extractionResult.totalTokensUsed ?? null
      });

      const tokens = extractionResult.totalTokensUsed ?? null;
      const confidence = extractionResult.confidence ?? null;
      const invoiceType = extractionResult.invoiceType;
      const perFieldConfidence = extractionResult.perFieldConfidence;
      
      // Log overall confidence and summary of per-field confidence
      const lowConfidenceFields = perFieldConfidence
        ? Object.entries(perFieldConfidence)
            .filter(([_, score]) => score < 0.5)
            .map(([field]) => field)
        : [];
      
      log({
        decision: 'OK',
        invoiceType,
        tokens,
        confidence,
        lowConfidenceFields: lowConfidenceFields.length > 0 ? lowConfidenceFields : undefined,
        perFieldConfidenceCount: perFieldConfidence ? Object.keys(perFieldConfidence).length : 0
      });

      // Return { jobId, status: 'llm_completed', extractedData, invoiceType, confidence, tokensUsed }
      const result = {
        jobId,
        status: 'llm_completed',
        result: {
          extractedData: extractionResult.data,
          invoiceType,
          confidence,
          tokensUsed: tokens
        },
        metadata: {
          processingTime: now() - t0,
          ocrLength: jobResult.rawOcrText.length
        }
      };

      // Update trace with success metadata
      trace?.update({
        output: {
          status: 'llm_completed',
          invoiceType,
          confidence,
          tokensUsed: tokens
        },
        metadata: {
          processingTimeMs: now() - t0,
          ocrTextLength: jobResult.rawOcrText.length,
          invoiceType,
          confidence
        }
      });

      // Flush spans to Langfuse before returning (important for Lambda)
      await flushSpans();

      return result;
    } finally {
      // Do not call db.end() - let Lambda container lifecycle manage connection cleanup
      // The shared database client is reused across warm Lambda invocations
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log({ decision: 'ERROR', message });

    // Update trace with error information
    trace?.update({
      output: {
        status: 'error',
        error: message
      },
      metadata: {
        processingTimeMs: now() - t0,
        errorMessage: message,
        level: 'ERROR'
      }
    });

    // Flush spans even on error to capture error traces
    await flushSpans().catch(() => {
      // Ignore flush errors to avoid masking original error
    });

    // On failure: throw typed error for Step Functions catch
    throw new Error(`LLM_EXTRACTION_ERROR: ${message}`);
  }
};
