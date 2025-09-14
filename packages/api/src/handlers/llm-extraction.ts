import { extractStructured } from '../services/llm/client';
import { InvoiceSchema } from '../services/llm/schemas/invoice';
import { DatabaseClient } from '@cira/database';

function now() { return Date.now(); }

async function getDbCredentials() {
  const secretArn = process.env['DATABASE_SECRET_ARN'];
  // Fallback to explicit envs if provided
  const envUser = process.env['DB_USER'];
  const envPassword = process.env['DB_PASSWORD'];
  if (envUser || envPassword) {
    return { user: envUser, password: envPassword } as { user?: string; password?: string };
  }
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

export const handler = async (event: any) => {
  const t0 = now();
  const jobId = event?.jobId ?? null;
  const ocr = event?.ocr;
  // Support both shapes:
  // A) { ocr: { metadata: {...} } }
  // B) { ocr: { ocr: { metadata: {...} }, status, jobId } }
  const ocrMetadata = ocr?.metadata ?? ocr?.ocr?.metadata;

  const log = (fields: Record<string, unknown>) => {
    const base = { timestamp: new Date().toISOString(), jobId, durationMs: now() - t0, ...fields };
    console.log(JSON.stringify(base));
  };

  try {
    // Validate input contains { jobId, ocr: { metadata } }
    if (!jobId) {
      log({ decision: 'VALIDATION', reason: 'missing_jobId' });
      throw new Error('Missing jobId');
    }
    if (!ocrMetadata) {
      log({ decision: 'VALIDATION', reason: 'missing_ocr_metadata' });
      throw new Error('OCR metadata missing');
    }

    // Load database configuration (matching OCR handler pattern)
    const dbConfig: any = { ssl: true };
    if (process.env['DATABASE_PROXY_ENDPOINT']) dbConfig.host = process.env['DATABASE_PROXY_ENDPOINT'];
    if (process.env['DATABASE_NAME']) dbConfig.database = process.env['DATABASE_NAME'];
    const creds = await getDbCredentials();
    if (creds.user) dbConfig.user = creds.user;
    if (creds.password) dbConfig.password = creds.password;

    const db = new DatabaseClient(dbConfig);

    try {
      // Load OCR text from database (stored by OCR processing step)
      const jobResult = await db.getJobResult(jobId);
      if (!jobResult || !jobResult.rawOcrText) {
        log({ decision: 'VALIDATION', reason: 'no_ocr_text' });
        throw new Error('No OCR text available');
      }

      // Invoke AI SDK client with InvoiceExtractionSchema
      const extractionResult = await extractStructured(InvoiceSchema, {
        markdown: jobResult.rawOcrText
      });

      // Validate extraction result (required fields present)
      if (!extractionResult.data) {
        log({ decision: 'VALIDATION', reason: 'no_extracted_data' });
        throw new Error('Extraction produced no data');
      }

      // On success: persist result with DatabaseClient.upsertJobResult
      await db.upsertJobResult({
        jobId,
        extractedData: extractionResult.data,
        confidence: extractionResult.confidence ?? null,
        tokensUsed: extractionResult.tokensUsed ?? null
      });

      const tokens = extractionResult.tokensUsed ?? null;
      const confidence = extractionResult.confidence ?? null;
      log({ decision: 'OK', tokens, confidence });

      // Return { jobId, status: 'llm_completed', extractedData, confidence, tokensUsed }
      return {
        jobId,
        status: 'llm_completed',
        result: {
          extractedData: extractionResult.data,
          confidence,
          tokensUsed: tokens
        },
        metadata: {
          processingTime: now() - t0,
          ocrLength: jobResult.rawOcrText.length
        }
      };
    } finally {
      await db.end();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log({ decision: 'ERROR', message });
    // On failure: throw typed error for Step Functions catch
    throw new Error(`LLM_EXTRACTION_ERROR: ${message}`);
  }
};
