/**
 * @fileoverview LLM Extraction Lambda Handler
 *
 * This module implements the final stage of the CIRA Invoice Processing System,
 * responsible for extracting structured data from OCR text using Azure OpenAI.
 *
 * Key Responsibilities:
 * - Retrieve OCR text from database (stored by OCR processing stage)
 * - Invoke Azure OpenAI for structured data extraction using AI SDK
 * - Validate extracted data against Zod schema
 * - Calculate confidence scores based on field weights
 * - Persist extraction results to database
 * - Return structured payload for Step Functions completion
 *
 * Processing Flow:
 * 1. Validate input contains jobId and OCR metadata
 * 2. Load OCR text from database using jobId
 * 3. Extract structured data using InvoiceSchema and AI SDK
 * 4. Validate extraction results and calculate confidence
 * 5. Persist results including token usage for cost tracking
 * 6. Return completion payload with metadata
 *
 * Integration Features:
 * - Azure OpenAI integration via AI SDK v5
 * - Zod schema validation for type safety
 * - Weighted confidence calculation
 * - Token usage tracking for cost monitoring
 * - Comprehensive error handling and logging
 *
 * @version 1.0.0
 * @author CIRA Development Team
 * @since 2025-09-15
 */

import { extractStructured } from '../services/llm/client';
import { InvoiceSchema } from '../services/llm/schemas/invoice';
import { DatabaseClient } from '@cira/database';

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
 * // Returns: { jobId, status: 'llm_completed', result: {...}, metadata: {...} }
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

    // Load database configuration (matching OCR handler pattern)
    const dbConfig: any = { ssl: true };
    if (process.env['DATABASE_PROXY_ENDPOINT']) dbConfig.host = process.env['DATABASE_PROXY_ENDPOINT'];
    if (process.env['DATABASE_NAME']) dbConfig.database = process.env['DATABASE_NAME'];
    const creds = await getDbCredentials();
    if (creds.user) dbConfig.user = creds.user;
    if (creds.password) dbConfig.password = creds.password;

    const db = new DatabaseClient(dbConfig);

    try {
      // Load OCR text from database (stored by OCR processing step)
      const jobResult = await db.getJobResult(jobId);
      if (!jobResult || !jobResult.rawOcrText) {
        log({ decision: 'VALIDATION', reason: 'no_ocr_text' });
        throw new Error('No OCR text available');
      }

      // Invoke AI SDK client with InvoiceExtractionSchema
      const extractionResult = await extractStructured(InvoiceSchema, {
        markdown: jobResult.rawOcrText
      });

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
        tokensUsed: extractionResult.tokensUsed ?? null
      });

      const tokens = extractionResult.tokensUsed ?? null;
      const confidence = extractionResult.confidence ?? null;
      log({ decision: 'OK', tokens, confidence });

      // Return { jobId, status: 'llm_completed', extractedData, confidence, tokensUsed }
      return {
        jobId,
        status: 'llm_completed',
        result: {
          extractedData: extractionResult.data,
          confidence,
          tokensUsed: tokens
        },
        metadata: {
          processingTime: now() - t0,
          ocrLength: jobResult.rawOcrText.length
        }
      };
    } finally {
      await db.end();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log({ decision: 'ERROR', message });
    // On failure: throw typed error for Step Functions catch
    throw new Error(`LLM_EXTRACTION_ERROR: ${message}`);
  }
};
