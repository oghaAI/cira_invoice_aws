/*
  Story 2.2: PDF URL Processing and Validation
  - Perform deep validation in this egress-enabled worker
  - Keep minimal, privacy-preserving logs
  - Stream response without persisting to disk; enforce size cap
*/

type DecisionCode =
  | 'OK'
  | 'VALIDATION_ERROR_URL'
  | 'VALIDATION_ERROR_PROTOCOL'
  | 'VALIDATION_ERROR_DOMAIN'
  | 'VALIDATION_ERROR_TYPE'
  | 'NETWORK_ERROR'
  | 'PDF_TOO_LARGE';

const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15MB
const TOTAL_TIMEOUT_MS = 20_000; // ~20s

function now() {
  return Date.now();
}

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

function isAllowedHost(hostname: string, allowlist: string[]): boolean {
  const hn = hostname.toLowerCase();
  return allowlist.some(domain => hn === domain || hn.endsWith(`.${domain.toLowerCase()}`));
}

function isLikelyPdfFromHeaders(contentType: string | null): boolean {
  if (!contentType) return false;
  return /application\/(pdf)(;.*)?$/i.test(contentType);
}

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
    const res: Response = await fetch(url, { method: 'GET', signal: combined?.signal ?? controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithRetry(url: string, totalTimeoutMs: number): Promise<{ response?: Response; retries: number }>
{
  const start = now();
  let attempt = 0;
  const backoffMs = 250;

  while (attempt < 2) {
    const remaining = Math.max(0, totalTimeoutMs - (now() - start));
    if (remaining === 0) break;
    try {
      const res = await fetchWithTimeout(url, remaining);
      // Retry only on 5xx
      if (res.status >= 500 && res.status <= 599 && attempt === 0) {
        attempt++;
        await new Promise(r => setTimeout(r, Math.min(backoffMs, remaining)));
        continue;
      }
      return { response: res, retries: attempt };
    } catch (e) {
      if (attempt === 0) {
        attempt++;
        await new Promise(r => setTimeout(r, Math.min(backoffMs, remaining)));
        continue;
      }
      break;
    }
  }
  return { retries: 1 };
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
import { DatabaseClient } from '@cira/database';

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
    const { response, retries } = await fetchWithRetry(pdfUrl, TOTAL_TIMEOUT_MS);
    if (!response) {
      log('NETWORK_ERROR', { retries });
      return { statusCode: 504, error_code: 'NETWORK_ERROR', message: 'Network failure or timeout', retries };
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
      const ocr = await provider.extract({ pdfUrl });
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
      const creds = await getDbCredentials();
      const dbConfig: any = { ssl: true };
      if (process.env['DATABASE_PROXY_ENDPOINT']) dbConfig.host = process.env['DATABASE_PROXY_ENDPOINT'];
      if (process.env['DATABASE_NAME']) dbConfig.database = process.env['DATABASE_NAME'];
      if (creds.user) dbConfig.user = creds.user;
      if (creds.password) dbConfig.password = creds.password;
      const db = new DatabaseClient(dbConfig);
      try {
        await db.upsertJobResult({
          jobId,
          rawOcrText: rawText,
          ocrProvider: ocr.metadata.provider ?? provider.name,
          ocrDurationMs: durationInt,
          ocrPages: pagesInt
        });
      } finally {
        await db.end();
      }

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
      const mapped = mapToUnifiedError(err);
      // Keep decision codes consistent with validation layer; include category in extra fields
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
