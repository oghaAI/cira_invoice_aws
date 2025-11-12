/**
 * @fileoverview OCR Processing Lambda Handler
 *
 * This module implements the OCR processing stage of the CIRA Invoice Processing System.
 * It handles PDF URL validation, content retrieval, and OCR text extraction through
 * external OCR providers (primarily Mistral OCR service).
 *
 * Key Responsibilities:
 * - PDF URL validation with domain allowlisting for security
 * - HTTP content retrieval with size limits and timeout handling
 * - Content-Type validation to ensure PDF files
 * - OCR text extraction via configurable providers
 * - Database persistence of OCR results
 * - Comprehensive error handling and logging
 *
 * Security Features:
 * - Domain allowlisting to prevent SSRF attacks
 * - HTTPS-only URL validation
 * - Content size limits (15MB for PDFs, 1MB for OCR text)
 * - Network timeout protection
 * - UTF-8 safety validation for extracted text
 *
 * Processing Flow:
 * 1. Validate PDF URL format and domain
 * 2. Fetch PDF content with size and timeout limits
 * 3. Validate content type as PDF
 * 4. Extract text using OCR provider
 * 5. Validate and persist OCR results
 * 6. Return compact payload for Step Functions
 *
 * @version 1.0.0
 * @author CIRA Development Team
 * @since 2025-09-15
 */

/**
 * Decision codes used for logging and error classification in OCR processing.
 * These codes help categorize different types of validation and processing errors.
 */
type DecisionCode =
  | 'OK'                      // Successful processing
  | 'VALIDATION_ERROR_URL'    // Invalid URL format or structure
  | 'VALIDATION_ERROR_PROTOCOL' // Non-HTTPS protocol
  | 'VALIDATION_ERROR_DOMAIN' // Domain not in allowlist
  | 'VALIDATION_ERROR_TYPE'   // Content is not a PDF
  | 'NETWORK_ERROR'          // Network connectivity issues
  | 'PDF_TOO_LARGE';         // PDF exceeds size limits

/** Maximum allowed PDF file size in bytes (15MB) to prevent memory exhaustion */
const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15MB

/** Total timeout for PDF fetch operations in milliseconds (45 seconds) */
const TOTAL_TIMEOUT_MS = 45_000; // ~45s

/**
 * Returns current timestamp in milliseconds for performance measurement.
 * @returns {number} Current time in milliseconds since Unix epoch
 */
function now() {
  return Date.now();
}

/**
 * Parses the allowed PDF host domains from environment configuration.
 *
 * This function implements domain allowlisting for security, preventing SSRF attacks
 * by restricting PDF downloads to trusted domains. Supports wildcard subdomain matching.
 *
 * @returns {string[]} Array of allowed domain patterns
 *
 * @example
 * ```typescript
 * // With ALLOWED_PDF_HOSTS="s3.amazonaws.com,example.com"
 * const domains = parseAllowedDomains();
 * // Returns: ['s3.amazonaws.com', 'example.com']
 * ```
 */
function parseAllowedDomains(): string[] {
  const env = process.env['ALLOWED_PDF_HOSTS']?.trim();
  if (env && env.length > 0) {
    return env
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }
  // Reasonable internal defaults; can be customized via env
  return [
    's3.amazonaws.com',
    'amazonaws.com', // covers regional s3 endpoints like s3.us-east-1.amazonaws.com
    'cloudfront.net'
  ];
}

/**
 * Checks if a hostname is allowed based on the domain allowlist.
 *
 * This function implements secure domain validation by checking if the provided hostname
 * matches any domain in the allowlist, supporting both exact matches and subdomain matching.
 *
 * @param {string} hostname - The hostname to validate
 * @param {string[]} allowlist - Array of allowed domain patterns
 * @returns {boolean} True if hostname is allowed, false otherwise
 *
 * @example
 * ```typescript
 * isAllowedHost('files.s3.amazonaws.com', ['amazonaws.com']); // true
 * isAllowedHost('malicious.com', ['amazonaws.com']); // false
 * ```
 */
function isAllowedHost(hostname: string, allowlist: string[]): boolean {
  const hn = hostname.toLowerCase();
  return allowlist.some(domain => hn === domain || hn.endsWith(`.${domain.toLowerCase()}`));
}

/**
 * Validates if the Content-Type header indicates a PDF file.
 *
 * @param {string | null} contentType - HTTP Content-Type header value
 * @returns {boolean} True if content type indicates PDF, false otherwise
 */
function isLikelyPdfFromHeaders(contentType: string | null): boolean {
  if (!contentType) return false;
  return /application\/(pdf)(;.*)?$/i.test(contentType);
}

/**
 * Checks if a URL path has a .pdf file extension.
 *
 * @param {string} urlPath - URL pathname to check
 * @returns {boolean} True if path ends with .pdf extension, false otherwise
 */
function hasPdfExtension(urlPath: string): boolean {
  return urlPath.toLowerCase().endsWith('.pdf');
}

async function fetchWithTimeout(url: string, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  try {
    const combined = signal
      ? new AbortController()
      : null;
    if (combined && signal) {
      signal.addEventListener('abort', () => combined.abort(signal.reason), { once: true });
    }
    // @ts-ignore - Node 20 global fetch
    const res: Response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'CIRA-Invoice-Processor/1.0',
        'Accept': 'application/pdf,*/*',
        'Accept-Encoding': 'identity'
      },
      signal: combined?.signal ?? controller.signal
    });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithRetry(url: string, totalTimeoutMs: number): Promise<{ response?: Response; retries: number; lastError?: string }>
{
  const start = now();
  let attempt = 0;
  const maxAttempts = 3;
  let lastError: string | undefined;

  while (attempt < maxAttempts) {
    const remaining = Math.max(0, totalTimeoutMs - (now() - start));
    if (remaining === 0) break;

    try {
      const res = await fetchWithTimeout(url, remaining);
      // Retry only on 5xx
      if (res.status >= 500 && res.status <= 599 && attempt < maxAttempts - 1) {
        attempt++;
        // Exponential backoff: 250ms, 500ms, 1000ms
        const backoffMs = 250 * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, Math.min(backoffMs, remaining)));
        continue;
      }
      return { response: res, retries: attempt };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (attempt < maxAttempts - 1) {
        attempt++;
        // Exponential backoff: 250ms, 500ms, 1000ms
        const backoffMs = 250 * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, Math.min(backoffMs, remaining)));
        continue;
      }
      break;
    }
  }
  return { retries: attempt, ...(lastError ? { lastError } : {}) };
}

async function consumeBodyWithLimit(body: ReadableStream<Uint8Array> | null, limit: number): Promise<number> {
  if (!body) return 0;
  const reader = (body as ReadableStream<Uint8Array>).getReader();
  let downloaded = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      downloaded += value?.byteLength ?? 0;
      if (downloaded > limit) {
        throw new Error('overflow');
      }
    }
    return downloaded;
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

import { getOcrProvider, OcrError } from '../services/ocr';
import { getSharedDatabaseClient } from '@cira/database';
import { downloadPdf } from '../utils/supabase-storage';

async function getDbCredentials() {
  const secretArn = process.env['DATABASE_SECRET_ARN'];
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

const MAX_OCR_TEXT_BYTES = (() => {
  const v = Number(process.env['OCR_TEXT_MAX_BYTES']);
  return Number.isFinite(v) && v > 0 ? v : 1 * 1024 * 1024; // 1MB default
})();

function isUtf8Safe(text: string): boolean {
  try {
    // Convert to Buffer and back; will throw only on impossible inputs. This is a basic sanity check.
    const b = Buffer.from(text, 'utf8');
    // Re-encode to ensure no exception. Not a full validator but sufficient for our purposes.
    void b.toString('utf8');
    return true;
  } catch {
    return false;
  }
}

export const handler = async (event: any) => {
  const t0 = now();
  const jobId = event?.jobId ?? null;
  const pdfUrl = event?.pdfUrl ?? null;
  const pages: number[] | undefined = event?.pages;
  const allowlist = parseAllowedDomains();

  const log = (decision: DecisionCode, extra?: Record<string, unknown>) => {
    const host = (() => {
      try {
        return pdfUrl ? new URL(pdfUrl).hostname : null;
      } catch {
        return null;
      }
    })();
    const base = {
      decision,
      jobId,
      hostname: host,
      durationMs: now() - t0,
      timestamp: new Date().toISOString(),
      ...extra
    } as Record<string, unknown>;
    console.log(JSON.stringify(base));
  };

  // Syntax + protocol validation
  try {
    if (!jobId || !pdfUrl) {
      log('VALIDATION_ERROR_URL', { reason: 'missing_fields' });
      return { statusCode: 400, error_code: 'VALIDATION_ERROR_URL', message: 'Missing jobId or pdfUrl' };
    }
    if (typeof pdfUrl !== 'string' || pdfUrl.length > 2048) {
      log('VALIDATION_ERROR_URL', { reason: 'length_or_type' });
      return { statusCode: 400, error_code: 'VALIDATION_ERROR_URL', message: 'Invalid pdfUrl' };
    }
    let u: URL;
    try {
      u = new URL(pdfUrl);
    } catch {
      log('VALIDATION_ERROR_URL', { reason: 'parse_error' });
      return { statusCode: 400, error_code: 'VALIDATION_ERROR_URL', message: 'Invalid URL syntax' };
    }
    if (u.protocol !== 'https:') {
      log('VALIDATION_ERROR_PROTOCOL');
      return { statusCode: 400, error_code: 'VALIDATION_ERROR_PROTOCOL', message: 'HTTPS required' };
    }
    if (!isAllowedHost(u.hostname, allowlist)) {
      log('VALIDATION_ERROR_DOMAIN');
      return { statusCode: 400, error_code: 'VALIDATION_ERROR_DOMAIN', message: 'Host not allowed' };
    }

    // Fetch with timeout+retry (GET)
    const { response, retries, lastError } = await fetchWithRetry(pdfUrl, TOTAL_TIMEOUT_MS);
    if (!response) {
      log('NETWORK_ERROR', { retries, error_message: lastError });
      return { statusCode: 504, error_code: 'NETWORK_ERROR', message: lastError || 'Network failure or timeout', retries };
    }

    // Do not retry on 4xx
    if (response.status >= 400 && response.status <= 499) {
      log('NETWORK_ERROR', { status: response.status, retries });
      return { statusCode: response.status, error_code: 'NETWORK_ERROR', message: 'Upstream 4xx', retries };
    }
    // After retry, treat 5xx as network error
    if (response.status >= 500 && response.status <= 599) {
      log('NETWORK_ERROR', { status: response.status, retries });
      return { statusCode: 502, error_code: 'NETWORK_ERROR', message: 'Upstream 5xx', retries };
    }

    // Check content-type or .pdf fallback
    const contentType = response.headers.get('content-type');
    const typeOk = isLikelyPdfFromHeaders(contentType) || hasPdfExtension(u.pathname);
    if (!typeOk) {
      log('VALIDATION_ERROR_TYPE', { contentType });
      return { statusCode: 400, error_code: 'VALIDATION_ERROR_TYPE', message: 'Not a PDF' };
    }

    // Enforce size cap: prefer Content-Length check, else stream
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      const len = Number(contentLength);
      if (Number.isFinite(len) && len > MAX_PDF_BYTES) {
        log('PDF_TOO_LARGE', { contentLength: len });
        return { statusCode: 413, error_code: 'PDF_TOO_LARGE', message: 'PDF too large', bytes: len };
      }
    }

    let downloaded = 0;
    if (!contentLength) {
      try {
        downloaded = await consumeBodyWithLimit(response.body as any, MAX_PDF_BYTES);
      } catch (e) {
        log('PDF_TOO_LARGE');
        return { statusCode: 413, error_code: 'PDF_TOO_LARGE', message: 'PDF too large (stream)', bytes: MAX_PDF_BYTES + 1 };
      }
    }

    // Success: proceed to OCR extraction via provider interface
    const provider = getOcrProvider();
    const ocrStart = now();
    try {
      const ocrInput: { pdfUrl: string; pages?: number[] } = { pdfUrl };
      if (pages && pages.length > 0) {
        ocrInput.pages = pages;
      }
      const ocr = await provider.extract(ocrInput);
      const rawText = ocr.markdown ?? '';
      const rawBytes = Buffer.byteLength(rawText, 'utf8');

      // Basic text validation
      if (typeof rawText !== 'string' || rawText.length === 0) {
        log('NETWORK_ERROR', { provider: provider.name, reason: 'empty_text' });
        return { statusCode: 400, error_code: 'VALIDATION_ERROR_OCR_TEXT', message: 'OCR text is empty' };
      }
      if (!isUtf8Safe(rawText)) {
        log('NETWORK_ERROR', { provider: provider.name, reason: 'utf8_invalid' });
        return { statusCode: 400, error_code: 'VALIDATION_ERROR_OCR_TEXT', message: 'OCR text not UTF-8 safe' };
      }
      if (rawBytes > MAX_OCR_TEXT_BYTES) {
        log('NETWORK_ERROR', { provider: provider.name, reason: 'ocr_text_too_large', bytes: rawBytes });
        return { statusCode: 413, error_code: 'OCR_TEXT_TOO_LARGE', message: 'OCR text exceeds size limit', bytes: rawBytes };
      }

      // Persist OCR outputs into job_results (sanitize numeric fields)
      const durationInt = Number.isFinite(ocr.metadata.durationMs) ? Math.max(0, Math.round(ocr.metadata.durationMs)) : null;
      const pagesInt = Number.isFinite((ocr.metadata as any).pages)
        ? Math.max(0, Math.trunc((ocr.metadata as any).pages as number))
        : null;
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
      await db.upsertJobResult({
        jobId,
        rawOcrText: rawText,
        ocrProvider: ocr.metadata.provider ?? provider.name,
        ocrDurationMs: durationInt,
        ocrPages: pagesInt
      });

      // Return a compact payload to Step Functions to avoid state size limits.
      // Raw OCR text is persisted in the database and not included here.
      const out = {
        jobId,
        status: 'ocr_completed',
        ocr: {
          provider: ocr.metadata.provider,
          metadata: {
            pages: ocr.metadata.pages,
            durationMs: ocr.metadata.durationMs
          }
        }
      };
      log('OK', { bytes: contentLength ? Number(contentLength) : downloaded, retries, provider: provider.name, ocrDurationMs: now() - ocrStart });
      return out;
    } catch (err) {
      // Check if this is the specific Mistral error that requires base64 fallback
      const shouldTryBase64Fallback =
        err instanceof OcrError &&
        err.category === 'VALIDATION' &&
        err.message.includes('Could not determine document type');

      if (shouldTryBase64Fallback) {
        log('NETWORK_ERROR', {
          provider: provider.name,
          reason: 'mistral_url_validation_error',
          message: 'Attempting base64 encoding fallback',
          originalError: err.message
        });

        try {
          // Download PDF and convert to base64 data URL
          const { buffer } = await downloadPdf(pdfUrl);
          const base64 = buffer.toString('base64');
          const dataUrl = `data:application/pdf;base64,${base64}`;

          log('OK', {
            reason: 'pdf_downloaded_for_base64',
            bufferSize: buffer.length,
            base64Length: base64.length
          });

          // Retry OCR with base64 data URL (single retry, no further fallback)
          const retryOcrInput: { pdfUrl: string; pages?: number[] } = { pdfUrl: dataUrl };
          if (pages && pages.length > 0) {
            retryOcrInput.pages = pages;
          }
          const ocr = await provider.extract(retryOcrInput);
          const rawText = ocr.markdown ?? '';
          const rawBytes = Buffer.byteLength(rawText, 'utf8');

          // Basic text validation
          if (typeof rawText !== 'string' || rawText.length === 0) {
            log('NETWORK_ERROR', { provider: provider.name, reason: 'empty_text_after_base64_retry' });
            return { statusCode: 400, error_code: 'VALIDATION_ERROR_OCR_TEXT', message: 'OCR text is empty after base64 retry' };
          }
          if (!isUtf8Safe(rawText)) {
            log('NETWORK_ERROR', { provider: provider.name, reason: 'utf8_invalid_after_base64_retry' });
            return { statusCode: 400, error_code: 'VALIDATION_ERROR_OCR_TEXT', message: 'OCR text not UTF-8 safe after base64 retry' };
          }
          if (rawBytes > MAX_OCR_TEXT_BYTES) {
            log('NETWORK_ERROR', { provider: provider.name, reason: 'ocr_text_too_large_after_base64_retry', bytes: rawBytes });
            return { statusCode: 413, error_code: 'OCR_TEXT_TOO_LARGE', message: 'OCR text exceeds size limit after base64 retry', bytes: rawBytes };
          }

          // Persist OCR outputs
          const durationInt = Number.isFinite(ocr.metadata.durationMs) ? Math.max(0, Math.round(ocr.metadata.durationMs)) : null;
          const pagesInt = Number.isFinite((ocr.metadata as any).pages)
            ? Math.max(0, Math.trunc((ocr.metadata as any).pages as number))
            : null;

          // Build database configuration
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

          await db.upsertJobResult({
            jobId,
            rawOcrText: rawText,
            ocrProvider: ocr.metadata.provider ?? provider.name,
            ocrDurationMs: durationInt,
            ocrPages: pagesInt
          });

          // Return success
          const out = {
            jobId,
            status: 'ocr_completed',
            ocr: {
              provider: ocr.metadata.provider,
              metadata: {
                pages: ocr.metadata.pages,
                durationMs: ocr.metadata.durationMs
              }
            }
          };
          log('OK', {
            bytes: contentLength ? Number(contentLength) : downloaded,
            retries,
            provider: provider.name,
            ocrDurationMs: now() - ocrStart,
            usedBase64Fallback: true
          });
          return out;
        } catch (fallbackErr) {
          // Fallback failed, log and return original error
          log('NETWORK_ERROR', {
            provider: provider.name,
            reason: 'base64_fallback_failed',
            fallbackError: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
          });
        }
      }

      // Return original error (either fallback not needed or fallback failed)
      const mapped = mapToUnifiedError(err);
      log('NETWORK_ERROR', { provider: provider.name, ocrDurationMs: now() - ocrStart, error_category: mapped.code, message: mapped.message });
      return { statusCode: mapped.statusCode, error_code: mapped.code, message: mapped.message };
    }
  } catch (err) {
    log('NETWORK_ERROR', { error: err instanceof Error ? err.message : String(err) });
    return { statusCode: 502, error_code: 'NETWORK_ERROR', message: 'Unexpected error' };
  }
};

function mapToUnifiedError(err: unknown): { code: 'VALIDATION' | 'AUTH' | 'QUOTA' | 'TIMEOUT' | 'SERVER' | 'FAILED_STATUS'; statusCode: number; message: string } {
  if (err instanceof OcrError) {
    const statusByCat: Record<string, number> = {
      VALIDATION: 400,
      AUTH: 401,
      QUOTA: 429,
      TIMEOUT: 504,
      SERVER: 502,
      FAILED_STATUS: 502
    };
    const statusCode = err.statusCode ?? statusByCat[err.category] ?? 502;
    return { code: err.category, statusCode, message: err.message };
  }
  const message = err instanceof Error ? err.message : 'Unknown OCR error';
  return { code: 'SERVER', statusCode: 502, message };
}
