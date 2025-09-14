import { extractStructured } from '../services/llm/client';
import { InvoiceSchema } from '../services/llm/schemas/invoice';
import { DatabaseClient } from '@cira/database';

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

    // Load database configuration
    const dbConfig: any = {};
    const creds: any = {};
    if (process.env['DB_HOST']) dbConfig.host = process.env['DB_HOST'];
    if (process.env['DB_PORT']) dbConfig.port = parseInt(process.env['DB_PORT'], 10);
    if (process.env['DB_NAME']) dbConfig.database = process.env['DB_NAME'];
    if (process.env['DB_USER']) creds.user = process.env['DB_USER'];
    if (process.env['DB_PASSWORD']) creds.password = process.env['DB_PASSWORD'];
    if (creds.user) dbConfig.user = creds.user;
    if (creds.password) dbConfig.password = creds.password;

    const db = new DatabaseClient(dbConfig);

    // Load OCR text from prior step
    const jobResult = await db.getJobResult(jobId);
    if (!jobResult || !jobResult.rawOcrText) {
      log({ decision: 'VALIDATION', reason: 'no_ocr_text' });
      return { statusCode: 400, error_code: 'VALIDATION', message: 'No OCR text available' };
    }

    // Extract structured data using the invoice schema
    const extractionResult = await extractStructured(InvoiceSchema, {
      markdown: jobResult.rawOcrText
    });

    // Persist extracted data and tokens used
    await db.upsertJobResult({
      jobId,
      extractedData: extractionResult.data,
      tokensUsed: extractionResult.tokensUsed ?? null
    });

    const tokens = extractionResult.tokensUsed ?? null;
    log({ decision: 'OK', tokens, confidence: extractionResult.confidence });

    // Return object for Step Functions
    return {
      jobId,
      status: 'llm_completed',
      extractedData: extractionResult.data,
      tokensUsed: tokens
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log({ decision: 'UNHANDLED', message });
    return { statusCode: 502, error_code: 'SERVER', message: 'LLM extraction error' };
  }
};
