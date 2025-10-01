import { OcrError, OcrMetadata, OcrProvider } from './index';

const DEFAULT_OPTIONS = {
  from_formats: ['pdf'],
  to_formats: ['md'],
  image_export_mode: 'placeholder',
  do_ocr: true,
  force_ocr: true,
  ocr_engine: 'rapidocr',
  ocr_lang: ['en'],
  pdf_backend: 'dlparse_v2',
  table_mode: 'fast',
  abort_on_error: false,
  return_as_file: false,
  return_chunks: false
} as const;

type InternalOptions = typeof DEFAULT_OPTIONS;

interface DoclingDocument {
  md_content?: string | null;
  text_content?: string | null;
  html_content?: string | null;
  doctags_content?: string | null;
  metadata?: {
    pages?: number | null;
    bytes?: number | null;
  };
}

interface DoclingResponse {
  status: 'success' | 'error';
  document?: DoclingDocument | null;
  errors?: { message?: string }[];
  processing_time?: number;
}

export function internalProvider(): OcrProvider {
  const endpoint = (process.env['INTERNAL_OCR_URL'] ?? process.env['OCR_INTERNAL_URL'])?.trim();
  if (!endpoint) {
    throw new OcrError({ message: 'Missing INTERNAL_OCR_URL', category: 'VALIDATION', provider: 'internal' });
  }

  const name = 'internal';
  const DEBUG = process.env['OCR_DEBUG'] === '1';
  const options = resolveOptions();

  return {
    name,
    async extract(input) {
      if (!input.pdfUrl) {
        throw new OcrError({ message: 'pdfUrl required', category: 'VALIDATION', provider: name });
      }

      const start = Date.now();
      const payload = {
        options,
        sources: [{ kind: 'http', url: input.pdfUrl }]
      };

      if (DEBUG) {
        log({ provider: name, endpoint, sources: payload.sources.length });
      }

      // @ts-ignore Node 20 fetch
      const response: Response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const requestId = response.headers.get('x-request-id') ?? response.headers.get('x-amzn-requestid');

      if (!response.ok) {
        const bodyText = await safeText(response);
        throw new OcrError({
          message: `internal http error ${response.status}${bodyText ? `: ${bodyText}` : ''}`,
          category: mapStatusToCategory(response.status),
          statusCode: response.status,
          provider: name,
          requestId
        });
      }

      const data = (await response.json()) as DoclingResponse;
      if (data.status !== 'success' || !data.document) {
        const errMsg =
          data.errors?.map(err => err?.message).filter(Boolean).join('; ') ||
          'provider did not return document payload';
        throw new OcrError({
          message: `internal provider error: ${errMsg}`,
          category: 'FAILED_STATUS',
          provider: name,
          requestId
        });
      }

      let markdown = resolveMarkdown(data.document);
      if (!markdown) {
        throw new OcrError({
          message: 'internal provider returned empty markdown',
          category: 'FAILED_STATUS',
          provider: name,
          requestId
        });
      }

      if (process.env['OCR_STRIP_IMAGE_LINKS'] === '1') {
        markdown = markdown.replace(/^!\[[^\]]*]\([^)]+\)\s*$/gm, '');
      }

      const durationMs = Date.now() - start;
      const metadata: OcrMetadata = { provider: name, durationMs };
      const pages = data.document.metadata?.pages;
      if (pages !== undefined && pages !== null) metadata.pages = Number(pages);
      const bytes = data.document.metadata?.bytes;
      if (bytes !== undefined && bytes !== null) metadata.bytes = Number(bytes);
      if (requestId) metadata.requestId = requestId;

      log({ provider: name, durationMs, requestId, pages: metadata.pages });

      return { markdown, metadata };
    }
  };
}

function resolveOptions(): InternalOptions {
  const override = process.env['INTERNAL_OCR_OPTIONS_JSON'];
  if (!override) return DEFAULT_OPTIONS;
  try {
    const parsed = JSON.parse(override);
    return { ...DEFAULT_OPTIONS, ...parsed };
  } catch {
    return DEFAULT_OPTIONS;
  }
}

function mapStatusToCategory(status: number): OcrError['category'] {
  if (status === 400) return 'VALIDATION';
  if (status === 401 || status === 403) return 'AUTH';
  if (status === 429) return 'QUOTA';
  if (status >= 500 && status <= 599) return 'SERVER';
  return 'SERVER';
}

function resolveMarkdown(doc: DoclingDocument): string {
  if (typeof doc.md_content === 'string' && doc.md_content.trim()) return safeMarkdown(doc.md_content);
  if (typeof doc.text_content === 'string' && doc.text_content.trim()) return safeMarkdown(doc.text_content);
  if (typeof doc.html_content === 'string' && doc.html_content.trim()) return safeMarkdown(doc.html_content);
  if (typeof doc.doctags_content === 'string' && doc.doctags_content.trim()) return safeMarkdown(doc.doctags_content);
  return '';
}

function safeMarkdown(text: string): string {
  return typeof text === 'string' ? text.toString() : '';
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
