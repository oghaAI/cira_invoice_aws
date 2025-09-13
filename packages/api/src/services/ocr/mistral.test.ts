import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mistralProvider } from './mistral';
import { OcrError } from './index';

function mkJsonResponse(body: unknown, init: ResponseInit & { headers?: Record<string, string> } = { status: 200 }) {
  const headers = new Headers({ 'content-type': 'application/json', ...(init.headers ?? {}) });
  return new Response(JSON.stringify(body), { ...init, headers });
}

describe('Mistral OCR adapter', () => {
  const realFetch = global.fetch;
  const realRandom = Math.random;
  let envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.useFakeTimers();
    // @ts-ignore
    global.fetch = vi.fn();
    vi.spyOn(Math, 'random').mockReturnValue(0); // deterministic jitter
    envBackup = {
      MISTRAL_OCR_API_URL: process.env.MISTRAL_OCR_API_URL,
      MISTRAL_API_KEY: process.env.MISTRAL_API_KEY
    };
    process.env.MISTRAL_OCR_API_URL = 'https://mistral.example.com/ocr';
    process.env.MISTRAL_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    // @ts-ignore
    global.fetch = realFetch;
    (Math.random as any).mockRestore?.();
    process.env.MISTRAL_OCR_API_URL = envBackup.MISTRAL_OCR_API_URL;
    process.env.MISTRAL_API_KEY = envBackup.MISTRAL_API_KEY;
  });

  it('polls and returns markdown with metadata on success', async () => {
    const sequence: Response[] = [
      // Create job
      mkJsonResponse({ id: 'abc', status: 'queued' }, { status: 200 }),
      // First poll -> queued
      mkJsonResponse({ id: 'abc', status: 'queued' }, { status: 200 }),
      // Second poll -> succeeded
      mkJsonResponse(
        { id: 'abc', status: 'succeeded', result: { markdown: '# Invoice\nHello', confidence: 0.95, pages: 2 } },
        { status: 200 }
      )
    ];
    // @ts-ignore
    (global.fetch as any).mockImplementation(() => Promise.resolve(sequence.shift()));

    const provider = mistralProvider();
    const promise = provider.extract({ pdfUrl: 'https://files.example.com/invoice.pdf' });

    // advance 1s to trigger first poll
    await vi.advanceTimersByTimeAsync(1000);
    // advance 2s to trigger second poll
    await vi.advanceTimersByTimeAsync(2000);

    const res = await promise;
    expect(res.markdown).toContain('# Invoice');
    expect(res.metadata.provider).toBe('mistral');
    expect(res.metadata.pages).toBe(2);
    expect((global.fetch as any).mock.calls.length).toBe(3);
  });

  it('maps 401/403 to AUTH error on create', async () => {
    // @ts-ignore
    (global.fetch as any).mockResolvedValue(new Response(null, { status: 401 }));
    const provider = mistralProvider();
    await expect(provider.extract({ pdfUrl: 'https://files.example.com/invoice.pdf' })).rejects.toMatchObject({
      category: 'AUTH'
    });
  });

  it('maps 400 to VALIDATION error on create', async () => {
    // @ts-ignore
    (global.fetch as any).mockResolvedValue(new Response(null, { status: 400 }));
    const provider = mistralProvider();
    await expect(provider.extract({ pdfUrl: 'https://files.example.com/invoice.pdf' })).rejects.toMatchObject({
      category: 'VALIDATION'
    });
  });

  it('maps 429 to QUOTA error on create', async () => {
    // @ts-ignore
    (global.fetch as any).mockResolvedValue(new Response(null, { status: 429 }));
    const provider = mistralProvider();
    await expect(provider.extract({ pdfUrl: 'https://files.example.com/invoice.pdf' })).rejects.toMatchObject({
      category: 'QUOTA'
    });
  });

  it('maps failed provider status to FAILED_STATUS', async () => {
    const sequence: Response[] = [
      mkJsonResponse({ id: 'abc', status: 'queued' }, { status: 200 }),
      mkJsonResponse({ id: 'abc', status: 'failed', error: 'ocr engine failed' }, { status: 200 })
    ];
    // @ts-ignore
    (global.fetch as any).mockImplementation(() => Promise.resolve(sequence.shift()));
    const provider = mistralProvider();
    const promise = provider.extract({ pdfUrl: 'https://files.example.com/invoice.pdf' });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).rejects.toMatchObject({ category: 'FAILED_STATUS' });
  });

  it('throws TIMEOUT when overall 5-minute cap exceeded', async () => {
    // Arrange: create succeeds, but we force Date.now to jump beyond the cap immediately
    // @ts-ignore
    (global.fetch as any).mockResolvedValueOnce(mkJsonResponse({ id: 'abc', status: 'queued' }, { status: 200 }));

    const dateSpy = vi.spyOn(Date, 'now');
    // First call for start -> 0, second call for while check -> > 5 minutes
    dateSpy.mockReturnValueOnce(0).mockReturnValueOnce(301_000);

    const provider = mistralProvider();
    await expect(provider.extract({ pdfUrl: 'https://files.example.com/invoice.pdf' })).rejects.toMatchObject({
      category: 'TIMEOUT'
    });
    dateSpy.mockRestore();
  });

  it('logs provider metrics without content leakage', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const sequence: Response[] = [
      mkJsonResponse({ id: 'abc123', status: 'queued' }, { status: 200, headers: { 'x-request-id': 'req-456' } }),
      mkJsonResponse(
        { id: 'abc123', status: 'succeeded', result: { markdown: '# Sensitive Invoice Data\nSecret info', confidence: 0.95, pages: 3 } },
        { status: 200, headers: { 'x-request-id': 'req-789' } }
      )
    ];
    // @ts-ignore
    (global.fetch as any).mockImplementation(() => Promise.resolve(sequence.shift()));

    const provider = mistralProvider();
    const promise = provider.extract({ pdfUrl: 'https://files.example.com/invoice.pdf' });
    await vi.advanceTimersByTimeAsync(1000);
    await promise;

    // Verify logging occurred
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"provider":"mistral"')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"pages":3')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"requestId":"req-789"')
    );

    // Verify no sensitive content leaked
    const logCalls = consoleSpy.mock.calls.flat();
    const allLogContent = logCalls.join(' ');
    expect(allLogContent).not.toContain('Sensitive Invoice Data');
    expect(allLogContent).not.toContain('Secret info');
    expect(allLogContent).not.toContain('files.example.com/invoice.pdf');

    consoleSpy.mockRestore();
  });
});

