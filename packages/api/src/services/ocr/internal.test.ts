import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { internalProvider } from './internal';
import { OcrError } from './index';

function mkJsonResponse(body: unknown, init: ResponseInit & { headers?: Record<string, string> } = { status: 200 }) {
  const headers = new Headers({ 'content-type': 'application/json', ...(init.headers ?? {}) });
  return new Response(JSON.stringify(body), { ...init, headers });
}

describe('Internal Docling OCR adapter', () => {
  const realFetch = global.fetch;
  let envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    // @ts-ignore
    global.fetch = vi.fn();
    envBackup = {
      INTERNAL_OCR_URL: process.env.INTERNAL_OCR_URL,
      INTERNAL_OCR_OPTIONS_JSON: process.env.INTERNAL_OCR_OPTIONS_JSON
    };
    process.env.INTERNAL_OCR_URL = 'https://docling.example.com/v1/convert/source';
    delete process.env.INTERNAL_OCR_OPTIONS_JSON;
  });

  afterEach(() => {
    // @ts-ignore
    global.fetch = realFetch;
    process.env.INTERNAL_OCR_URL = envBackup.INTERNAL_OCR_URL;
    process.env.INTERNAL_OCR_OPTIONS_JSON = envBackup.INTERNAL_OCR_OPTIONS_JSON;
    vi.clearAllMocks();
  });

  it('returns markdown with metadata on success', async () => {
    const response = mkJsonResponse(
      {
        status: 'success',
        document: {
          md_content: '# Invoice\nHello world',
          metadata: { pages: 3, bytes: 5120 }
        }
      },
      { status: 200, headers: { 'x-request-id': 'req-internal-1' } }
    );
    // @ts-ignore
    (global.fetch as any).mockResolvedValue(response);

    const provider = internalProvider();
    const result = await provider.extract({ pdfUrl: 'https://files.example.com/invoice.pdf' });

    expect(result.markdown).toContain('# Invoice');
    expect(result.metadata.provider).toBe('internal');
    expect(result.metadata.pages).toBe(3);
    expect(result.metadata.requestId).toBe('req-internal-1');
  });

  it('maps non-success payloads to FAILED_STATUS', async () => {
    const response = mkJsonResponse({ status: 'error', errors: [{ message: 'ocr failed' }] }, { status: 200 });
    // @ts-ignore
    (global.fetch as any).mockResolvedValue(response);

    const provider = internalProvider();
    await expect(provider.extract({ pdfUrl: 'https://files.example.com/invoice.pdf' })).rejects.toMatchObject({
      category: 'FAILED_STATUS'
    });
  });

  it('maps http 403 to AUTH', async () => {
    // @ts-ignore
    (global.fetch as any).mockResolvedValue(new Response(null, { status: 403 }));

    const provider = internalProvider();
    await expect(provider.extract({ pdfUrl: 'https://files.example.com/invoice.pdf' })).rejects.toMatchObject({
      category: 'AUTH'
    });
  });

  it('requires pdfUrl input', async () => {
    const provider = internalProvider();
    await expect(provider.extract({})).rejects.toBeInstanceOf(OcrError);
  });

  it('requires INTERNAL_OCR_URL to be configured', () => {
    delete process.env.INTERNAL_OCR_URL;
    expect(() => internalProvider()).toThrow(/INTERNAL_OCR_URL/);
  });

  it('falls back to default options when override JSON is invalid', async () => {
    process.env.INTERNAL_OCR_OPTIONS_JSON = '{ not-valid-json ';
    const response = mkJsonResponse(
      {
        status: 'success',
        document: {
          md_content: 'ok'
        }
      },
      { status: 200 }
    );
    // @ts-ignore
    (global.fetch as any).mockResolvedValue(response);

    const provider = internalProvider();
    await expect(provider.extract({ pdfUrl: 'https://files.example.com/invoice.pdf' })).resolves.toBeTruthy();
  });
});
