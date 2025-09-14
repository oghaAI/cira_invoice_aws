import { callLlm } from '../services/llm/client';
import { buildInvoiceExtractionPrompt } from '../services/llm/prompts/invoice';

function now() { return Date.now(); }

export const handler = async (event: any) => {
  const t0 = now();
  const jobId = event?.jobId ?? null;
  const status: string | undefined = event?.status ?? event?.ocr?.status;

  const log = (fields: Record<string, unknown>) => {
    const base = { timestamp: new Date().toISOString(), jobId, durationMs: now() - t0, ...fields };
    console.log(JSON.stringify(base));
  };

  try {
    if (!jobId) {
      log({ decision: 'VALIDATION', reason: 'missing_jobId' });
      return { statusCode: 400, error_code: 'VALIDATION', message: 'Missing jobId' };
    }
    if (status !== 'ocr_completed') {
      log({ decision: 'VALIDATION', reason: 'ocr_not_completed' });
      return { statusCode: 400, error_code: 'VALIDATION', message: 'OCR not completed' };
    }

    // For Story 3.1: scaffold only. We intentionally do not load PII/markdown here.
    // Provide minimal safe content; in Story 3.2 we will supply schema + real OCR text.
    const messages = buildInvoiceExtractionPrompt('(OCR text available in DB; omitted from logs)');

    const result = await callLlm({ messages, timeoutMs: 30_000, maxRetries: 2 });

    if (!result.success) {
      const cat = result.error.category;
      const statusByCat: Record<string, number> = {
        VALIDATION: 400,
        AUTH: 401,
        QUOTA: 429,
        TIMEOUT: 504,
        SERVER: 502,
        FAILED_STATUS: 502
      };
      log({ decision: 'LLM_ERROR', category: cat });
      return { statusCode: statusByCat[cat] ?? 502, error_code: cat, message: result.error.message };
    }

    const tokens = result.usage?.totalTokens ?? null;
    log({ decision: 'OK', tokens });

    // Minimal Step Functions output; no PII
    return {
      jobId,
      status: 'llm_completed',
      llm: {
        provider: 'azure_openai',
        metadata: {
          durationMs: result.durationMs,
          tokens
        }
      }
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log({ decision: 'UNHANDLED', message });
    return { statusCode: 502, error_code: 'SERVER', message: 'LLM extraction error' };
  }
};
