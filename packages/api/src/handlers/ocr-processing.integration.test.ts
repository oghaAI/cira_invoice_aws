import { describe, it, expect } from 'vitest';
import { handler } from './ocr-processing';

const run = process.env.RUN_OCR_INTEGRATION === '1';

describe('OCR Integration (Mistral)', () => {
  it.runIf(run)('end-to-end with real Mistral API', { timeout: 330_000 }, async () => {
    // Increased timeout for network + OCR processing (up to ~5.5 minutes)

    const pdfUrl = process.env.TEST_PDF_URL as string | undefined;
    const apiUrl = process.env.MISTRAL_OCR_API_URL as string | undefined;
    const apiKey = process.env.MISTRAL_API_KEY as string | undefined;

    expect(apiUrl, 'MISTRAL_OCR_API_URL must be set').toBeTruthy();
    expect(apiKey, 'MISTRAL_API_KEY must be set').toBeTruthy();
    expect(pdfUrl, 'TEST_PDF_URL must be set').toBeTruthy();

    // Configure provider and allow host dynamically from TEST_PDF_URL
    process.env.OCR_PROVIDER = 'mistral';
    try {
      const host = new URL(pdfUrl!).hostname;
      process.env.ALLOWED_PDF_HOSTS = host;
    } catch {}

    const jobId = `test-${Date.now()}`;
    const res = await handler({ jobId, pdfUrl });

    // If handler returned an error shape, surface it
    if ('error_code' in (res as any)) {
      // eslint-disable-next-line no-console
      console.error('Integration error:', res);
    }

    expect((res as any).ocr).toBeDefined();
    expect((res as any).ocr.provider).toBe('mistral');
    expect(typeof (res as any).ocr.markdown).toBe('string');
    expect(((res as any).ocr.markdown as string).length).toBeGreaterThan(0);
  });
});
