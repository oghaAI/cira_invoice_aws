import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

// Mock OCR provider to isolate handler from real provider/network/env
const mockExtract = vi.fn(async () => ({
  markdown: '# Invoice\n',
  metadata: { provider: 'mock', durationMs: 5, confidence: 0.9, pages: 1 }
}));

vi.mock('../services/ocr', () => {
  return {
    getOcrProvider: () => ({ name: 'mock', extract: mockExtract }),
    OcrError: class OcrError extends Error { constructor(msg: string) { super(msg); this.name = 'OcrError'; } }
  };
});

// Mock database client to avoid real connections
const upsertSpy = vi.fn(async () => ({}));
vi.mock('@cira/database', () => {
  return {
    DatabaseClient: vi.fn().mockImplementation(() => ({
      upsertJobResult: upsertSpy,
      end: vi.fn(async () => {})
    }))
  };
});

let handler: any;
beforeAll(async () => {
  // Ensure no Secrets Manager access during tests
  delete process.env.DATABASE_SECRET_ARN;
  ({ handler } = await import('./ocr-processing'));
});

// Use Node18+/20 web fetch/Response/ReadableStream globals

function setAllowedHosts(hosts: string) {
  process.env.ALLOWED_PDF_HOSTS = hosts;
}

function clearAllowedHosts() {
  delete process.env.ALLOWED_PDF_HOSTS;
}

function mkResponse(
  body: BodyInit | null,
  init: ResponseInit & { headers?: Record<string, string> }
): Response {
  const headers = new Headers(init.headers ?? {});
  return new Response(body, { ...init, headers });
}

describe('ocr-processing validation', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    // @ts-ignore
    global.fetch = vi.fn();
    setAllowedHosts('example.com,cloudfront.net');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    // @ts-ignore
    global.fetch = realFetch;
    clearAllowedHosts();
  });

  it('rejects invalid URL syntax without calling fetch', async () => {
    // @ts-ignore
    const spy = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const res = await handler({ jobId: 'j1', pdfUrl: ':://bad-url' });
    expect(res.statusCode).toBe(400);
    expect(res.error_code).toBe('VALIDATION_ERROR_URL');
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects non-HTTPS scheme', async () => {
    const res = await handler({ jobId: 'j1', pdfUrl: 'http://files.example.com/invoice.pdf' });
    expect(res.statusCode).toBe(400);
    expect(res.error_code).toBe('VALIDATION_ERROR_PROTOCOL');
  });

  it('accepts allowed host with application/pdf content-type and runs OCR provider', async () => {
    // @ts-ignore
    (global.fetch as any).mockResolvedValue(
      mkResponse(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'application/pdf', 'content-length': '3' }
      })
    );

    const res = await handler({ jobId: 'j-ok', pdfUrl: 'https://files.example.com/doc.pdf' });
    // Should return OCR output
    expect((res as any).ocr).toBeDefined();
    expect((res as any).ocr.provider).toBe('mock');
    expect((res as any).ocr.markdown).toContain('# Invoice');
    // Provider should have been invoked once
    expect(mockExtract).toHaveBeenCalledTimes(1);
    // Should persist OCR result
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'j-ok', rawOcrText: expect.any(String), ocrProvider: 'mock', ocrDurationMs: expect.any(Number) })
    );
  });

  it('accepts .pdf extension when content-type is inconclusive and runs OCR', async () => {
    // @ts-ignore
    (global.fetch as any).mockResolvedValue(
      mkResponse(new Uint8Array([1, 2]), {
        status: 200,
        headers: { 'content-type': 'text/plain', 'content-length': '2' }
      })
    );

    const res = await handler({ jobId: 'j-ok2', pdfUrl: 'https://files.example.com/unknown.pdf' });
    expect((res as any).ocr).toBeDefined();
    expect((res as any).ocr.markdown).toContain('# Invoice');
  });

  it('retries once on 5xx then fails with NETWORK_ERROR', async () => {
    const sequence = [
      mkResponse(null, { status: 500, headers: {} }),
      mkResponse(null, { status: 503, headers: {} })
    ];
    // @ts-ignore
    (global.fetch as any).mockImplementation(() => Promise.resolve(sequence.shift()));

    // Advance timers to handle retry backoff
    const promise = handler({ jobId: 'j-5xx', pdfUrl: 'https://files.example.com/file.pdf' });
    await vi.advanceTimersByTimeAsync(1000); // Advance past backoff
    const res = await promise;

    expect('error_code' in res ? res.error_code : null).toBe('NETWORK_ERROR');
    expect('statusCode' in res ? res.statusCode : null).toBe(502);
  });

  it('does not retry on 4xx and returns code', async () => {
    // @ts-ignore
    (global.fetch as any).mockResolvedValue(mkResponse(null, { status: 404, headers: {} }));
    const res = await handler({ jobId: 'j-4xx', pdfUrl: 'https://files.example.com/file.pdf' });
    expect('error_code' in res ? res.error_code : null).toBe('NETWORK_ERROR');
    expect('statusCode' in res ? res.statusCode : null).toBe(404);
  });

  it('rejects when Content-Length exceeds limit', async () => {
    // @ts-ignore
    (global.fetch as any).mockResolvedValue(
      mkResponse(null, { status: 200, headers: { 'content-type': 'application/pdf', 'content-length': `${16 * 1024 * 1024}` } })
    );
    const res = await handler({ jobId: 'j-big', pdfUrl: 'https://files.example.com/big.pdf' });
    expect('error_code' in res ? res.error_code : null).toBe('PDF_TOO_LARGE');
    expect('statusCode' in res ? res.statusCode : null).toBe(413);
  });

  it('streams without content-length and rejects on overflow', async () => {
    const chunk = new Uint8Array(1024 * 1024); // 1MB
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        // push 16 chunks (16MB) to exceed 15MB limit
        for (let i = 0; i < 16; i++) controller.enqueue(chunk);
        controller.close();
      }
    });

    // @ts-ignore
    (global.fetch as any).mockResolvedValue(
      mkResponse(body as unknown as BodyInit, { status: 200, headers: { 'content-type': 'application/pdf' } })
    );
    const res = await handler({ jobId: 'j-overflow', pdfUrl: 'https://files.example.com/stream.pdf' });
    expect('error_code' in res ? res.error_code : null).toBe('PDF_TOO_LARGE');
    expect('statusCode' in res ? res.statusCode : null).toBe(413);
  });

  it('rejects empty OCR text before persistence', async () => {
    mockExtract.mockResolvedValueOnce({ markdown: '', metadata: { provider: 'mock', durationMs: 1 } });
    // @ts-ignore
    (global.fetch as any).mockResolvedValue(
      mkResponse(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'application/pdf', 'content-length': '3' } })
    );
    const res = await handler({ jobId: 'j-empty', pdfUrl: 'https://files.example.com/doc.pdf' });
    expect('error_code' in res ? res.error_code : null).toBe('VALIDATION_ERROR_OCR_TEXT');
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});
