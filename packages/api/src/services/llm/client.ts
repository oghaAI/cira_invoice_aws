import { z } from 'zod';
import { createOpenAI } from '@ai-sdk/openai';
import { generateObject, generateText, type CoreMessage } from 'ai';

export type LlmErrorCategory = 'VALIDATION' | 'AUTH' | 'QUOTA' | 'TIMEOUT' | 'SERVER' | 'FAILED_STATUS';

export class LlmError extends Error {
  category: LlmErrorCategory;
  statusCode?: number;
  provider?: string;
  requestId?: string | null;
  causeMessage?: string;

  constructor(options: {
    message: string;
    category: LlmErrorCategory;
    statusCode?: number;
    provider?: string;
    requestId?: string | null;
    cause?: unknown;
  }) {
    super(options.message);
    this.category = options.category;
    if (options.statusCode !== undefined) this.statusCode = options.statusCode;
    if (options.provider !== undefined) this.provider = options.provider;
    if (options.requestId !== undefined) this.requestId = options.requestId;
    const cm = options.cause instanceof Error ? options.cause.message : undefined;
    if (cm !== undefined) this.causeMessage = cm;
  }

  toJSON() {
    return {
      name: 'LlmError',
      message: this.message,
      category: this.category,
      statusCode: this.statusCode,
      provider: this.provider,
      requestId: this.requestId
    } as const;
  }
}

export interface LlmClientConfig {
  endpoint: string;
  apiKey: string;
  deployment: string; // Azure deployment name (acts as model ID)
  apiVersion: string;
}

export function getRequiredEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    throw new LlmError({ message: `Missing required env: ${name}`, category: 'VALIDATION' });
  }
  return v.trim();
}

export function getLlmClient(): { modelId: string; config: LlmClientConfig } {
  const endpoint = getRequiredEnv('AZURE_OPENAI_ENDPOINT');
  const apiKey = getRequiredEnv('AZURE_OPENAI_API_KEY');
  const deployment = getRequiredEnv('AZURE_OPENAI_DEPLOYMENT');
  const apiVersion = (process.env['AZURE_OPENAI_API_VERSION'] as string | undefined)?.trim() || '2024-08-01-preview';
  return { modelId: deployment, config: { endpoint, apiKey, deployment, apiVersion } };
}

function mapStatusToCategory(status: number): LlmErrorCategory {
  if (status === 400) return 'VALIDATION';
  if (status === 401 || status === 403) return 'AUTH';
  if (status === 429) return 'QUOTA';
  if (status >= 500 && status <= 599) return 'SERVER';
  return 'SERVER';
}

function mapError(err: unknown): unknown {
  if (err instanceof LlmError) return err;
  if (err && typeof err === 'object') {
    const anyErr = err as any;
    if (anyErr.name === 'AbortError') {
      return new LlmError({ message: 'Timeout/abort', category: 'TIMEOUT' });
    }
    // AI SDK error shapes may include status/statusCode or response with status
    const status: number | undefined = anyErr.statusCode ?? anyErr.status ?? anyErr.response?.status;
    if (typeof status === 'number') {
      const category = mapStatusToCategory(status);
      const message = typeof anyErr.message === 'string' && anyErr.message.length > 0 ? anyErr.message : `HTTP ${status}`;
      return new LlmError({ message, category, statusCode: status, provider: 'azure_openai' });
    }
  }
  // Azure/OpenAI HTTP errors may bubble with Response-like info in message; we treat unknown as SERVER
  return err;
}

function jitter(base: number, spread = 200) {
  const j = Math.floor(Math.random() * spread);
  return base + j;
}

function log(fields: Record<string, unknown>) {
  try {
    const base = { timestamp: new Date().toISOString(), ...fields };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(base));
  } catch {}
}

export type CallLlmOptions<T> = {
  messages: CoreMessage[];
  schema?: z.ZodType<T>;
  timeoutMs?: number;
  maxRetries?: number;
};

export type CallLlmResult<T = unknown> = {
  success: true;
  data: T | string; // string for unstructured text, typed object when schema is provided
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  durationMs: number;
} | {
  success: false;
  error: LlmError;
  durationMs: number;
};

export async function callLlm<T = unknown>(opts: CallLlmOptions<T>): Promise<CallLlmResult<T>> {
  const t0 = Date.now();
  let modelId: string;
  let config: LlmClientConfig;
  try {
    const loaded = getLlmClient();
    modelId = loaded.modelId;
    config = loaded.config;
  } catch (e) {
    const err = e instanceof LlmError ? e : new LlmError({ message: (e as any)?.message ?? 'LLM config error', category: 'VALIDATION' });
    return { success: false, error: err, durationMs: Date.now() - t0 };
  }

  // Configure Azure OpenAI provider via AI SDK
  const openai = createOpenAI({
    baseURL: `${config.endpoint.replace(/\/$/, '')}/openai/deployments/${encodeURIComponent(config.deployment)}?api-version=${encodeURIComponent(config.apiVersion)}`,
    apiKey: config.apiKey,
    headers: { 'api-key': config.apiKey }
  });

  // The callable model is the deployment name
  const model = openai(modelId);

  const timeoutMs = Number.isFinite(opts.timeoutMs) && (opts.timeoutMs as number) > 0 ? (opts.timeoutMs as number) : 30_000;
  const maxRetries = Number.isFinite(opts.maxRetries) ? Math.max(0, Math.trunc(opts.maxRetries as number)) : 2;

  const attempts = [500, 1000, 2000, 4000, 4000];
  let attempt = 0;

  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
    const aStart = Date.now();
    try {
      if (opts.schema) {
        const result = await __aiFns.generateObject({ model, messages: opts.messages, schema: opts.schema, abortSignal: controller.signal });
        clearTimeout(timer);
        const durationMs = Date.now() - t0;
        const usage = result.usage as any;
        log({ provider: 'azure_openai', model: modelId, attempt, durationMs: Date.now() - aStart, status: 'ok', tokens: usage?.totalTokens });
        return { success: true, data: result.object as T, usage, durationMs };
      } else {
        const result = await __aiFns.generateText({ model, messages: opts.messages, abortSignal: controller.signal });
        clearTimeout(timer);
        const durationMs = Date.now() - t0;
        const usage = result.usage as any;
        log({ provider: 'azure_openai', model: modelId, attempt, durationMs: Date.now() - aStart, status: 'ok', tokens: usage?.totalTokens });
        return { success: true, data: result.text, usage, durationMs };
      }
    } catch (e) {
      clearTimeout(timer);
      const err = mapError(e);
      if (err instanceof LlmError) {
        // Decide retry based on category
        const retryable = err.category === 'QUOTA' || err.category === 'TIMEOUT' || err.category === 'SERVER';
        log({ provider: 'azure_openai', model: modelId, attempt, status: 'error', category: err.category });
        if (retryable && attempt < maxRetries) {
          const idx = Math.min(attempt, attempts.length - 1);
          await new Promise(res => setTimeout(res, jitter(attempts[idx] ?? 0)));
          attempt++;
          continue;
        }
        return { success: false, error: err, durationMs: Date.now() - t0 };
      }
      // Unknown error, try to map HTTPish status if present
      const message = err instanceof Error ? err.message : 'Unknown LLM error';
      // Try to detect HTTP status embedded in error
      let category: LlmErrorCategory = 'SERVER';
      if (/\b(400)\b/.test(message)) category = 'VALIDATION';
      else if (/\b(401|403)\b/.test(message)) category = 'AUTH';
      else if (/\b429\b/.test(message)) category = 'QUOTA';
      else if (/\b(5\d\d)\b/.test(message)) category = 'SERVER';
      const wrapped = new LlmError({ message, category });
      log({ provider: 'azure_openai', model: modelId, attempt, status: 'error', category: wrapped.category });
      if ((wrapped.category === 'QUOTA' || wrapped.category === 'SERVER') && attempt < maxRetries) {
        const idx = Math.min(attempt, attempts.length - 1);
        await new Promise(res => setTimeout(res, jitter(attempts[idx] ?? 0)));
        attempt++;
        continue;
      }
      return { success: false, error: wrapped, durationMs: Date.now() - t0 };
    }
  }
}

export interface ConfidenceWeights {
  amounts?: number;        // invoice_*_amount fields
  dates?: number;          // *_date fields
  identifiers?: number;    // invoice_number, policy_number, account_number
  addresses?: number;      // payment_remittance_* fields
  names?: number;          // vendor_name, community_name, etc.
  validation?: number;     // valid_input field
  default?: number;        // fallback for uncategorized fields
}

export interface ExtractStructuredOptions {
  confidenceWeights?: ConfidenceWeights;
}

export type ExtractStructuredResult<T> = {
  data: T;
  tokensUsed?: number | undefined;
  confidence?: number | undefined;
};

export async function extractStructured<T>(
  schema: z.ZodType<T>,
  input: { markdown: string },
  options?: ExtractStructuredOptions
): Promise<ExtractStructuredResult<T>> {
  const prompt = `Extract structured data from the following invoice document. Return only fields in the schema, plus reasoning (1–2 sentences for every field, including when null) and confidence (one of: low, medium, high) for every field. For null fields, explain why and set confidence accordingly. Do not return decimals.

Document content:
${input.markdown}`;

  const messages: CoreMessage[] = [
    { role: 'user', content: prompt }
  ];

  const result = await callLlm({
    messages,
    schema,
    timeoutMs: 60000, // 60 seconds for complex extraction
    maxRetries: 3
  });

  if (!result.success) {
    throw result.error;
  }

  // Apply minimal normalization
  const normalizedData = normalizeExtractedData(result.data as T);

  return {
    data: normalizedData,
    tokensUsed: result.usage?.totalTokens,
    confidence: calculateWeightedConfidence(normalizedData, options?.confidenceWeights)
  };
}

function normalizeExtractedData<T>(data: T): T {
  if (data === null || data === undefined || typeof data !== 'object') {
    return data;
  }

  const normalized = { ...data } as any;

  // Normalize all string values by trimming
  for (const [key, value] of Object.entries(normalized)) {
    if (value && typeof value === 'object' && 'value' in value) {
      const fieldData = value as any;
      if (typeof fieldData.value === 'string') {
        fieldData.value = fieldData.value.trim() || null;
      }
      // Optional: Convert numeric-like strings to numbers safely for amount fields
      if (typeof fieldData.value === 'string' && fieldData.value !== null && key.includes('amount')) {
        const numericValue = parseFloat(fieldData.value);
        if (!isNaN(numericValue) && isFinite(numericValue)) {
          fieldData.value = numericValue;
        }
      }
    }
  }

  return normalized;
}

function getFieldCategory(fieldName: string): keyof ConfidenceWeights {
  if (fieldName.includes('amount')) return 'amounts';
  if (fieldName.includes('date')) return 'dates';
  if (['invoice_number', 'policy_number', 'account_number'].includes(fieldName)) return 'identifiers';
  if (fieldName.startsWith('payment_remittance_')) return 'addresses';
  if (['vendor_name', 'community_name'].includes(fieldName)) return 'names';
  if (fieldName === 'valid_input') return 'validation';
  return 'default';
}

function calculateWeightedConfidence<T>(data: T, weights?: ConfidenceWeights): number {
  if (!data || typeof data !== 'object') return 0;

  // Default weights
  const defaultWeights: Required<ConfidenceWeights> = {
    amounts: 0.3,
    dates: 0.25,
    identifiers: 0.2,
    addresses: 0.1,
    names: 0.1,
    validation: 0.05,
    default: 0.1
  };

  const finalWeights = { ...defaultWeights, ...weights };

  const fieldScores: Array<{ score: number; weight: number }> = [];

  for (const [fieldName, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'confidence' in value) {
      const fieldData = value as any;
      const confidenceLevel = fieldData.confidence;

      let score = 0;
      if (confidenceLevel === 'high') score = 0.9;
      else if (confidenceLevel === 'medium') score = 0.6;
      else if (confidenceLevel === 'low') score = 0.3;

      const category = getFieldCategory(fieldName);
      const weight = finalWeights[category];

      fieldScores.push({ score, weight });
    }
  }

  if (fieldScores.length === 0) return 0;

  // Calculate weighted average
  const totalWeightedScore = fieldScores.reduce((sum, item) => sum + (item.score * item.weight), 0);
  const totalWeight = fieldScores.reduce((sum, item) => sum + item.weight, 0);

  return totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
}

export type { CoreMessage };

// Test seam for injecting AI SDK functions in unit tests without ESM namespace spying
type AiFns = {
  generateText: typeof generateText;
  generateObject: typeof generateObject;
};

let __aiFns: AiFns = {
  generateText,
  generateObject
};

export function __setAiFns(fns: Partial<AiFns>) {
  __aiFns = { ...__aiFns, ...fns };
}

export function __resetAiFns() {
  __aiFns = { generateText, generateObject };
}
