import { OcrError, OcrProvider, OcrResult, OcrMetadata } from './index';

// Minimal, provider-agnostic polling/backoff with jitter
function sleep(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

function jitter(base: number, spread = 250) {
  const j = Math.floor(Math.random() * spread);
  return base + j;
}

export function mistralProvider(): OcrProvider {
  const baseUrlRaw = process.env['MISTRAL_OCR_API_URL'] as string | undefined;
  const apiKeyRaw = process.env['MISTRAL_API_KEY'] as string | undefined;
  if (!baseUrlRaw || !apiKeyRaw) {
    throw new OcrError({ message: 'Missing MISTRAL_OCR_API_URL or MISTRAL_API_KEY', category: 'VALIDATION' });
  }
  const baseUrl: string = baseUrlRaw;
  const apiKey: string = apiKeyRaw;
  const createPathEnv = (process.env['MISTRAL_OCR_CREATE_PATH'] as string | undefined)?.trim();
  const statusPathEnv = (process.env['MISTRAL_OCR_STATUS_PATH'] as string | undefined)?.trim();
  const CREATE_PATH = createPathEnv && createPathEnv.length > 0 ? createPathEnv : 'jobs';
  const STATUS_PATH_TMPL = statusPathEnv && statusPathEnv.length > 0 ? statusPathEnv : 'jobs/{id}';

  const name = 'mistral';
  const DEBUG = process.env['OCR_DEBUG'] === '1';
  const ocrMode = (process.env['MISTRAL_OCR_MODE'] as string | undefined)?.toLowerCase();
  const isSyncMode = ocrMode === 'sync';
  const ocrModel = (process.env['MISTRAL_OCR_MODEL'] as string | undefined) || 'mistral-ocr-latest';
  const includeImageBase64 = (process.env['MISTRAL_INCLUDE_IMAGE_BASE64'] as string | undefined) !== '0';
  // Auto-detect sensible default for sync path to avoid double /ocr or missing path
  // If base URL already ends with /ocr, default to '' (post to base). Otherwise, default to 'ocr'.
  const baseEndsWithOcr = /(^|\/)ocr\/?$/.test(new URL(baseUrl).pathname);
  const syncPathDefault = baseEndsWithOcr ? '' : 'ocr';
  const syncPathEnv = ((process.env['MISTRAL_OCR_SYNC_PATH'] as string | undefined)?.trim() ?? syncPathDefault);

  async function http<T>(path: string, init: RequestInit & { method: string }): Promise<{ data: T; requestId: string | null; status: number }> {
    const url = path.startsWith('http') ? path : `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json',
      authorization: `Bearer ${apiKey}`
    };
    if (DEBUG) {
      try {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify({ provider: name, method: init.method, url }));
      } catch {}
    }
    // @ts-ignore Node 20 fetch
    const res: Response = await fetch(url, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    const requestId = res.headers.get('x-request-id');
    if (!res.ok) {
      const bodyText = await safeText(res);
      const mapped = mapStatusToCategory(res.status);
      throw new OcrError({
        message: `mistral http error ${res.status}${bodyText ? `: ${bodyText}` : ''}`,
        category: mapped,
        statusCode: res.status,
        provider: name,
        requestId
      });
    }
    const data = (await res.json()) as T;
    return { data, requestId, status: res.status };
  }

  return {
    name,
    async extract(input): Promise<OcrResult> {
      if (!input.pdfUrl && !input.stream) {
        throw new OcrError({ message: 'pdfUrl or stream required', category: 'VALIDATION', provider: name });
      }

      const start = Date.now();

      // Sync mode: directly POST to base URL (optionally with sync path) as per Mistral API
      if (isSyncMode) {
        if (!input.pdfUrl) {
          throw new OcrError({ message: 'stream input not supported in sync mode yet', category: 'VALIDATION', provider: name });
        }
        const payload = {
          model: ocrModel,
          document: {
            type: 'document_url',
            document_url: input.pdfUrl
          },
          include_image_base64: includeImageBase64
        } as const;
        const { data, requestId } = await http<any>(syncPathEnv, { method: 'POST', body: JSON.stringify(payload) });
        const durationMs = Date.now() - start;

        // Build a single markdown body from pages[] when present, otherwise fallback
        let markdown = '';
        if (Array.isArray((data as any)?.pages) && (data as any).pages.length > 0) {
          const sorted = [...(data as any).pages].sort((a: any, b: any) => (a?.index ?? 0) - (b?.index ?? 0));
          const parts = sorted.map((p: any) => (typeof p?.markdown === 'string' ? p.markdown : '')).filter(Boolean);
          markdown = parts.join('\n\n---\n\n');
        } else {
          markdown = extractMarkdownFromResponse(data);
        }

        // Optionally strip image-only lines to keep size lean
        if (process.env['OCR_STRIP_IMAGE_LINKS'] === '1') {
          markdown = markdown.replace(/^!\[[^\]]*]\([^)]+\)\s*$/gm, '');
        }

        const metadata: OcrMetadata = { provider: name, durationMs };
        const pages = (data as any)?.usage_info?.pages_processed ?? (Array.isArray((data as any)?.pages) ? (data as any).pages.length : undefined);
        if (pages !== undefined) metadata.pages = Number(pages);
        if ((data as any)?.confidence !== undefined) metadata.confidence = Number((data as any).confidence);
        if (requestId) metadata.requestId = requestId;
        if ((data as any)?.usage_info?.doc_size_bytes !== undefined) metadata.bytes = Number((data as any).usage_info.doc_size_bytes);

        log({ provider: name, requestId, durationMs, pages: metadata.pages, attempt: 0 });
        return { markdown, metadata };
      }

      const createPayload: any = input.pdfUrl ? { pdfUrl: input.pdfUrl } : { upload: true };

      // Create job
      const { data: created, requestId: createReqId } = await http<{ id: string; status: string }>(CREATE_PATH, {
        method: 'POST',
        body: JSON.stringify(createPayload)
      });

      // Optional: upload flow if required by provider (not implemented; out of scope)
      // if (input.stream && created.uploadUrl) { /* upload to pre-signed URL */ }

      // Poll status
      const maxTotalMs = 5 * 60 * 1000; // 5 minutes
      const attempts: number[] = [1000, 2000, 4000, 8000, 8000]; // cap at 8s
      let attempt = 0;
      let lastReqId: string | null = createReqId ?? null;
      let pages: number | undefined;
      while (true) {
        if (Date.now() - start > maxTotalMs) {
          throw new OcrError({ message: 'OCR timeout', category: 'TIMEOUT', provider: name, requestId: lastReqId });
        }
        const idx = Math.min(attempt, attempts.length - 1);
        const backoff = attempts[idx] ?? 8000;
        await sleep(jitter(backoff));
        attempt++;
        try {
          const { data: statusData, requestId } = await http<{
            id: string;
            status: 'queued' | 'processing' | 'succeeded' | 'failed';
            result?: { markdown: string; confidence?: number; pages?: number };
            error?: string;
          }>(interpolateStatusPath(STATUS_PATH_TMPL, created.id), { method: 'GET' });
          lastReqId = requestId ?? lastReqId;
          if (statusData.status === 'succeeded' && statusData.result) {
            const durationMs = Date.now() - start;
            pages = statusData.result.pages;
            const markdown = safeMarkdown(statusData.result.markdown);
            log({
              provider: name,
              requestId: lastReqId,
              durationMs,
              pages,
              attempt
            });
            const metadata: OcrMetadata = { provider: name, durationMs };
            if (statusData.result.confidence !== undefined) metadata.confidence = statusData.result.confidence;
            if (pages !== undefined) metadata.pages = pages;
            if (lastReqId) metadata.requestId = lastReqId;
            return { markdown, metadata };
          }
          if (statusData.status === 'failed') {
            throw new OcrError({
              message: statusData.error || 'Provider failed',
              category: 'FAILED_STATUS',
              provider: name,
              requestId: lastReqId
            });
          }
        } catch (err) {
          const mapped = mapError(err);
          if (mapped instanceof OcrError) {
            if (mapped.category === 'AUTH' || mapped.category === 'VALIDATION' || mapped.category === 'FAILED_STATUS') {
              throw mapped;
            }
            // retry on QUOTA/TIMEOUT/SERVER
          } else {
            // unknown -> treat as SERVER
            // continue
          }
        }
      }
    }
  } satisfies OcrProvider;
}

function mapStatusToCategory(status: number): OcrError['category'] {
  if (status === 400) return 'VALIDATION';
  if (status === 401 || status === 403) return 'AUTH';
  if (status === 429) return 'QUOTA';
  if (status >= 500 && status <= 599) return 'SERVER';
  return 'SERVER';
}

function mapError(err: unknown): unknown {
  if (err instanceof OcrError) return err;
  if (err && typeof err === 'object' && 'name' in err && (err as any).name === 'AbortError') {
    return new OcrError({ message: 'Timeout/abort', category: 'TIMEOUT' });
  }
  return err;
}

function interpolateStatusPath(tmpl: string, id: string): string {
  if (tmpl.includes('{id}')) return tmpl.replace('{id}', encodeURIComponent(id));
  // Fallback: append id if placeholder missing
  return `${tmpl.replace(/\/$/, '')}/${encodeURIComponent(id)}`;
}

function safeMarkdown(text: string): string {
  // Ensure UTF-8 safe text (best-effort)
  return typeof text === 'string' ? text.toString() : '';
}

function extractMarkdownFromResponse(data: any): string {
  try {
    if (!data || typeof data !== 'object') return JSON.stringify(data ?? '');
    if (typeof (data as any).markdown === 'string') return safeMarkdown((data as any).markdown);
    if (typeof (data as any).text === 'string') return safeMarkdown((data as any).text);
    if (typeof (data as any).content === 'string') return safeMarkdown((data as any).content);
    if ((data as any).result) {
      const r = (data as any).result;
      if (typeof r.markdown === 'string') return safeMarkdown(r.markdown);
      if (typeof r.text === 'string') return safeMarkdown(r.text);
    }
    return JSON.stringify(data);
  } catch {
    return '';
  }
}

async function safeText(res: Response): Promise<string | null> {
  try {
    return await res.text();
  } catch {
    return null;
  }
}

function log(fields: Record<string, unknown>) {
  try {
    const base = { timestamp: new Date().toISOString(), ...fields };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(base));
  } catch {}
}
