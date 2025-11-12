/**
 * @fileoverview Job Management Lambda Handler
 *
 * This module implements the core job management Lambda function for the CIRA Invoice Processing System.
 * It serves as the primary API Gateway integration point, handling all HTTP requests for job lifecycle
 * management including creation, status checking, and result retrieval.
 *
 * Key Responsibilities:
 * - Job creation with PDF URL validation and Step Functions orchestration
 * - Job status tracking with real-time phase information
 * - Result retrieval with structured data extraction
 * - OCR text retrieval with size limiting and truncation
 * - Health check endpoint for system monitoring
 * - Direct Step Functions invocation handling for workflow updates
 *
 * API Endpoints:
 * - POST /jobs - Create new invoice processing job
 * - GET /jobs/{jobId} - Get complete job information
 * - GET /jobs/{jobId}/status - Get job status with processing phase
 * - GET /jobs/{jobId}/result - Get extracted invoice data
 * - GET /jobs/{jobId}/ocr - Get raw OCR text (with optional truncation)
 * - GET / - Health check endpoint
 *
 * Security Features:
 * - API key authentication via AWS API Gateway
 * - Client isolation through API key validation
 * - Input validation and sanitization
 * - Error message sanitization to prevent information leakage
 *
 * @version 1.0.0
 * @author CIRA Development Team
 * @since 2025-09-15
 */

import { APIGatewayProxyResult } from 'aws-lambda';
import { getSharedDatabaseClient } from '@cira/database';
import { API_VERSION } from '../index';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { NodeHttpHandler } from '@smithy/node-http-handler';

/**
 * Retrieves database credentials from AWS Secrets Manager.
 *
 * This function handles the secure retrieval of database credentials from AWS Secrets Manager,
 * with graceful fallback for local development environments where AWS services may not be available.
 *
 * @returns {Promise<{user?: string, password?: string}>} Database credentials object
 *
 * @example
 * ```typescript
 * const creds = await getDbCredentials();
 * if (creds.user && creds.password) {
 *   // Use credentials to connect to database
 * }
 * ```
 */
async function getDbCredentials() {
  const secretArn = process.env['DATABASE_SECRET_ARN'];
  if (!secretArn) return { user: undefined, password: undefined };
  try {
    const client = new SecretsManagerClient({});
    const res = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
    const secretString = res.SecretString ?? Buffer.from(res.SecretBinary ?? '').toString('utf8');
    try {
      const parsed = JSON.parse(secretString || '{}');
      return { user: parsed.username, password: parsed.password } as { user?: string; password?: string };
    } catch {
      return { user: undefined, password: undefined };
    }
  } catch {
    // In local/test environments without AWS access, fall back gracefully
    return { user: undefined, password: undefined };
  }
}

/**
 * Main Lambda handler for job management operations.
 *
 * This function serves as the entry point for all job management operations, handling both
 * HTTP requests from API Gateway and direct invocations from Step Functions for job status updates.
 *
 * Supported Operations:
 * - HTTP API requests: Job creation, status checking, result retrieval
 * - Step Functions direct invocation: Job status updates (start, phase, complete, fail)
 *
 * The handler implements comprehensive logging, error handling, and database connection management
 * with automatic cleanup to prevent connection leaks.
 *
 * @param {any} event - Either API Gateway event or Step Functions direct invocation payload
 * @returns {Promise<APIGatewayProxyResult | any>} HTTP response for API Gateway or direct response for Step Functions
 *
 * @example
 * ```typescript
 * // API Gateway invocation
 * const apiResponse = await handler({
 *   httpMethod: 'POST',
 *   resource: '/jobs',
 *   body: JSON.stringify({ pdf_url: 'https://example.com/invoice.pdf' })
 * });
 *
 * // Step Functions direct invocation
 * const stepResponse = await handler({
 *   action: 'complete',
 *   jobId: 'job-uuid',
 *   result: { extractedData: {...}, confidence: 0.95 }
 * });
 * ```
 */
export const handler = async (event: any): Promise<APIGatewayProxyResult | any> => {
  const start = Date.now();

  /**
   * Structured logging function that captures request context and timing information.
   * Logs are formatted as JSON for CloudWatch integration and include security-safe fields.
   *
   * @param {string} level - Log level ('info' or 'error')
   * @param {string} message - Log message
   * @param {Record<string, unknown>} extra - Additional context fields
   */
  const log = (level: 'info' | 'error', message: string, extra?: Record<string, unknown>) => {
    const safe = {
      level,
      message,
      timestamp: new Date().toISOString(),
      clientId: event?.requestContext?.identity?.apiKeyId ?? null,
      method: event?.httpMethod ?? null,
      resource: (event as any)?.resource ?? null,
      path: event?.path ?? null,
      ...extra
    } as Record<string, unknown>;
    console.log(JSON.stringify(safe));
  };

  log('info', 'Incoming request');

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
    // Handle direct invocation by Step Functions for job updates
    if (event && typeof event === 'object' && 'action' in event) {
      const { action, jobId } = event as { action: string; jobId: string };
      if (!jobId || typeof jobId !== 'string') {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing jobId' }) };
      }
      if (action === 'start') {
        await db.setJobStatusProcessing(jobId);
        return { ok: true };
      }
      if (action === 'phase') {
        const { phase } = event as { phase: 'analyzing_invoice' | 'extracting_data' | 'verifying_data' };
        await db.setJobProcessingPhase(jobId, phase);
        return { ok: true };
      }
      if (action === 'complete') {
        const { result } = event as any;
        // Persist job result if provided
        if (result) {
          await db.upsertJobResult({
            jobId,
            extractedData: result?.extractedData ?? null,
            confidenceScore: result?.confidence ?? null,
            tokensUsed: result?.tokensUsed ?? null
          });
        }
        // Mark job as completed
        await db.updateJobStatus(jobId, 'completed', null, new Date());
        // Clear phase if supported
        await db.clearJobProcessingPhase(jobId);
        return { ok: true };
      }
      if (action === 'fail') {
        const err = event?.error;
        const errorMessage =
          typeof err === 'string' ? err : err?.Cause || err?.Error || JSON.stringify(err ?? {});
        await db.updateJobStatus(jobId, 'failed', errorMessage ?? 'failed');
        await db.clearJobProcessingPhase(jobId);
        return { ok: true };
      }
      return { statusCode: 400, body: JSON.stringify({ error: 'Unsupported action' }) };
    }
    const { httpMethod, resource, pathParameters, body } = event as any;

    // Extract client_id from API Gateway context
    const clientId = event.requestContext.identity.apiKeyId ?? null;

    switch (httpMethod) {
      case 'POST': {
        if (resource === '/jobs') {
          const parsed = body ? JSON.parse(body) : {};
          const pdfUrl: string | undefined = parsed.pdf_url || parsed.pdfUrl;
          const pages: number[] | undefined = parsed.pages;

          // Basic validation per story: presence, https, length<=2048
          if (!pdfUrl) {
            return json(400, errorBody('VALIDATION_ERROR', 'pdf_url is required'));
          }
          if (typeof pdfUrl !== 'string' || pdfUrl.length > 2048) {
            return json(400, errorBody('VALIDATION_ERROR', 'pdf_url must be a string with max length 2048'));
          }
          let parsedUrl: URL;
          try {
            parsedUrl = new URL(pdfUrl);
          } catch {
            return json(400, errorBody('VALIDATION_ERROR', 'pdf_url must be a valid URL'));
          }
          if (parsedUrl.protocol !== 'https:') {
            return json(400, errorBody('VALIDATION_ERROR', 'pdf_url must use HTTPS'));
          }

          // Validate pages parameter if provided (must be array of numbers, 0-indexed)
          if (pages !== undefined) {
            if (!Array.isArray(pages)) {
              return json(400, errorBody('VALIDATION_ERROR', 'pages must be an array of integers'));
            }
            if (pages.length > 0 && !pages.every((p) => typeof p === 'number' && Number.isInteger(p) && p >= 0)) {
              return json(400, errorBody('VALIDATION_ERROR', 'pages must contain only non-negative integers'));
            }
          }

          // Note: Skipping network HEAD accessibility check due to isolated subnet; will be handled downstream

          const job = await db.createJob({ clientId, pdfUrl });

          // Trigger Step Functions execution if configured
          try {
            const stateMachineArn = process.env['WORKFLOW_STATE_MACHINE_ARN'];
            if (stateMachineArn) {
              // Use short HTTP timeouts so API doesn't hang if SFN endpoint is unreachable
              const sfn = new SFNClient({
                requestHandler: new NodeHttpHandler({ connectionTimeout: 1500, requestTimeout: 3000 })
              });
              // Build Step Functions input with optional pages parameter
              const sfnInput: any = { jobId: job.id, pdfUrl };
              if (pages && pages.length > 0) {
                sfnInput.pages = pages;
              }
              const cmd = new StartExecutionCommand({
                stateMachineArn,
                input: JSON.stringify(sfnInput)
              });
              const exec = await sfn.send(cmd);
              log('info', 'Triggered Step Functions execution', { jobId: job.id, executionArn: exec.executionArn });
            } else {
              log('error', 'WORKFLOW_STATE_MACHINE_ARN not configured; skipping execution start', { jobId: job.id });
            }
          } catch (e) {
            log('error', 'Failed to start Step Functions execution', {
              jobId: job.id,
              error: e instanceof Error ? e.message : String(e)
            });
          }

          const response = {
            job_id: job.id,
            status: job.status,
            created_at: job.createdAt.toISOString()
          };
          log('info', 'Job created', { jobId: job.id });
          return json(201, response);
        }
        break;
      }
      case 'GET': {
        // Health check at root
        if (resource === '/') {
          const healthy = typeof (db as any).healthCheck === 'function' ? await (db as any).healthCheck() : true;
          const body = {
            status: healthy ? 'healthy' : 'down',
            version: API_VERSION,
            timestamp: new Date().toISOString(),
            database: healthy ? 'connected' : 'disconnected'
          } as const;
          return json(200, body);
        }

        if (resource === '/jobs/{jobId}/ocr' && pathParameters?.jobId) {
          const jobId = pathParameters.jobId;
          const job = await db.getJobById(jobId);
          if (!job) {
            return json(404, errorBody('NOT_FOUND', 'Job not found'));
          }
          if (clientId && job.clientId && clientId !== job.clientId) {
            return json(404, errorBody('NOT_FOUND', 'Job not found'));
          }

          const result = await db.getJobResult(jobId);
          if (!result) {
            return json(404, errorBody('NOT_FOUND', 'OCR results not found'));
          }

          const q = (event as any).queryStringParameters || {};
          const wantRaw = String(q.raw || '').toLowerCase() === 'true';
          const maxBytes = (() => {
            const v = Number(process.env['OCR_RETRIEVAL_MAX_BYTES']);
            return Number.isFinite(v) && v > 0 ? v : 256 * 1024; // 256KB default
          })();

          const full = result.rawOcrText ?? '';
          const buf = Buffer.from(full, 'utf8');
          const truncated = !wantRaw && buf.byteLength > maxBytes;
          const trimmed = truncated ? buf.subarray(0, maxBytes).toString('utf8') : full;

          const body = {
            job_id: job.id,
            provider: result.ocrProvider ?? undefined,
            duration_ms: result.ocrDurationMs ?? undefined,
            pages: result.ocrPages ?? undefined,
            raw_ocr_text: trimmed,
            truncated
          } as Record<string, unknown>;

          log('info', 'OCR retrieval', { jobId: job.id, bytes: Buffer.byteLength(trimmed, 'utf8'), truncated });
          return json(200, body);
        }

        if (resource === '/jobs/{jobId}' && pathParameters?.jobId) {
          const jobId = pathParameters.jobId;
          if (!isUuid(jobId)) {
            return json(400, errorBody('VALIDATION_ERROR', 'job_id must be a valid UUID'));
          }
          const job = await db.getJobById(jobId);
          if (!job) {
            return json(404, errorBody('NOT_FOUND', 'Job not found'));
          }
          if (clientId && job.clientId && clientId !== job.clientId) {
            return json(404, errorBody('NOT_FOUND', 'Job not found'));
          }
          return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify(job)
          };
        }

        if (resource === '/jobs/{jobId}/status' && pathParameters?.jobId) {
          const jobId = pathParameters.jobId;
          if (!isUuid(jobId)) {
            return json(400, errorBody('VALIDATION_ERROR', 'job_id must be a valid UUID'));
          }
          const job = await db.getJobById(jobId);
          if (!job) {
            return json(404, errorBody('NOT_FOUND', 'Job not found'));
          }
          if (clientId && job.clientId && clientId !== job.clientId) {
            return json(404, errorBody('NOT_FOUND', 'Job not found'));
          }
          return json(200, {
            id: job.id,
            status: job.status,
            ...(job.status === 'processing' && (job as any).processingPhase
              ? {
                  phase: (job as any).processingPhase,
                  phase_label: phaseLabel((job as any).processingPhase as any)
                }
              : {}),
            created_at: job.createdAt.toISOString(),
            updated_at: job.updatedAt.toISOString(),
            completed_at: job.completedAt ? job.completedAt.toISOString() : undefined
          });
        }

        if (resource === '/jobs/{jobId}/result' && pathParameters?.jobId) {
          const jobId = pathParameters.jobId;
          if (!isUuid(jobId)) {
            return json(400, errorBody('VALIDATION_ERROR', 'job_id must be a valid UUID'));
          }
          const job = await db.getJobById(jobId);
          if (!job) {
            return json(404, errorBody('NOT_FOUND', 'Job not found'));
          }
          if (clientId && job.clientId && clientId !== job.clientId) {
            return json(404, errorBody('NOT_FOUND', 'Job not found'));
          }
          if (job.status !== 'completed') {
            return json(404, errorBody('NOT_FOUND', 'Job not completed'));
          }

          const result = await db.getJobResult(jobId);
          if (!result) {
            return json(404, errorBody('NOT_FOUND', 'Result not found'));
          }

          // Validate extracted_data shape loosely - allow extra keys
          const extractedData = result.extractedData;
          if (extractedData && typeof extractedData !== 'object') {
            log('error', 'Invalid extracted_data shape', { jobId, type: typeof extractedData });
            return json(500, errorBody('INTERNAL_SERVER_ERROR', 'Invalid result format'));
          }

          // Build response with all result data including OCR markdown
          const response = {
            job_id: job.id,
            extracted_data: extractedData,
            confidence_score: result.confidenceScore,
            tokens_used: result.tokensUsed,
            raw_ocr_markdown: result.rawOcrText,
            temp_url: job.tempUrl
          };

          log('info', 'Result retrieval', {
            jobId: job.id,
            hasExtractedData: !!extractedData,
            confidenceScore: result.confidenceScore,
            tokensUsed: result.tokensUsed
          });
          return json(200, response);
        }
        break;
      }
      default:
        return json(405, errorBody('METHOD_NOT_ALLOWED', `HTTP ${httpMethod} not supported`));
    }

    return json(404, errorBody('NOT_FOUND', 'Endpoint not found'));
  } catch (error) {
    log('error', 'Unhandled error in job management handler', {
      error: error instanceof Error ? error.message : String(error)
    });
    return json(500, errorBody('INTERNAL_SERVER_ERROR', 'An error occurred processing your request'));
  } finally {
    // Do not call db.end() - let Lambda container lifecycle manage connection cleanup
    // The shared database client is reused across warm Lambda invocations
    log('info', 'Request completed', { duration_ms: Date.now() - start });
  }
};

/**
 * Creates a standardized JSON HTTP response for API Gateway.
 *
 * This utility function ensures consistent response formatting across all endpoints,
 * including proper CORS headers for cross-origin requests and standardized content types.
 *
 * @param {number} statusCode - HTTP status code (200, 400, 404, 500, etc.)
 * @param {unknown} body - Response body object to be JSON-serialized
 * @returns {APIGatewayProxyResult} Formatted API Gateway response
 *
 * @example
 * ```typescript
 * return json(200, { job_id: 'abc123', status: 'completed' });
 * return json(404, errorBody('NOT_FOUND', 'Job not found'));
 * ```
 */
function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key,Authorization'
    },
    body: JSON.stringify(body)
  };
}

/**
 * Creates a standardized error response body structure.
 *
 * This function ensures consistent error formatting across all API endpoints,
 * providing both machine-readable error codes and human-readable messages.
 *
 * @param {string} error_code - Machine-readable error identifier
 * @param {string} message - Human-readable error description
 * @returns {object} Standardized error object
 *
 * @example
 * ```typescript
 * errorBody('VALIDATION_ERROR', 'pdf_url is required');
 * errorBody('NOT_FOUND', 'Job not found');
 * ```
 */
function errorBody(error_code: string, message: string) {
  return { error_code, message };
}

/**
 * Validates if a string is a properly formatted UUID (version 1-5).
 *
 * This function uses a comprehensive regex pattern to validate UUID format,
 * ensuring strict compliance with RFC 4122 specification for UUID structure.
 *
 * @param {string} id - String to validate as UUID
 * @returns {boolean} True if string is a valid UUID, false otherwise
 *
 * @example
 * ```typescript
 * isUuid('550e8400-e29b-41d4-a716-446655440000'); // true
 * isUuid('invalid-uuid'); // false
 * ```
 */
function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Converts internal processing phase codes to user-friendly labels.
 *
 * This function provides human-readable labels for the different phases of
 * invoice processing, improving the user experience when checking job status.
 *
 * @param {string} phase - Internal phase identifier
 * @returns {string} User-friendly phase description
 *
 * @example
 * ```typescript
 * phaseLabel('analyzing_invoice'); // 'Analyzing invoice'
 * phaseLabel('extracting_data'); // 'Extracting data'
 * ```
 */
function phaseLabel(phase: 'analyzing_invoice' | 'extracting_data' | 'verifying_data'): string {
  switch (phase) {
    case 'analyzing_invoice':
      return 'Analyzing invoice';
    case 'extracting_data':
      return 'Extracting data';
    case 'verifying_data':
      return 'Verifying data';
    default:
      return 'Processing';
  }
}
