/**
 * @fileoverview LLM Client Service
 *
 * This module provides a comprehensive client interface for Azure OpenAI integration
 * using the AI SDK v5. It handles structured data extraction with retry logic,
 * error categorization, and confidence scoring for the CIRA Invoice Processing System.
 *
 * Key Features:
 * - Azure OpenAI integration via AI SDK v5 createAzure provider
 * - Structured object generation with Zod schema validation
 * - Comprehensive error handling with categorized error types
 * - Automatic retry logic with exponential backoff and jitter
 * - Token usage tracking for cost monitoring
 * - Weighted confidence calculation for extraction quality
 * - Type-safe configuration management
 *
 * Architecture:
 * - Factory pattern for LLM client configuration
 * - Error mapping and categorization for different failure modes
 * - Flexible timeout and retry configuration
 * - Normalization and validation of extracted data
 * - Test seams for unit testing without external dependencies
 *
 * @version 1.0.0
 * @author CIRA Development Team
 * @since 2025-09-15
 */

import { z } from 'zod';
import { createAzure as createAzureOpenAI } from '@ai-sdk/azure';
import { createAzure as createAzureCustom } from '@quail-ai/azure-ai-provider';

import { generateObject, NoObjectGeneratedError } from 'ai';
import { jsonrepair } from 'jsonrepair';

import { langfuse } from '../../instrumentation.js';

/**
 * Categories of LLM errors for proper error handling and retry logic.
 * Each category maps to specific HTTP status codes and retry strategies.
 */
export type LlmErrorCategory =
  | 'VALIDATION'
  | 'AUTH'
  | 'QUOTA'
  | 'TIMEOUT'
  | 'SERVER'
  | 'FAILED_STATUS'
  | 'SCHEMA_VALIDATION';

/**
 * Custom error class for LLM-related operations with detailed categorization.
 * Provides structured error information for debugging and monitoring.
 */
export class LlmError extends Error {
  /** Error category for retry and handling logic */
  category: LlmErrorCategory;
  /** HTTP status code if applicable */
  statusCode?: number;
  /** LLM provider identifier */
  provider?: string;
  /** Request ID for tracing */
  requestId?: string | null;
  /** Original error message from underlying cause */
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

/**
 * Configuration for the underlying Azure provider. Supports both
 * Azure OpenAI-compatible deployments and the native Azure AI endpoints.
 */
export type LlmClientConfig =
  | {
      mode: 'azure-custom';
      deployment: string;
      endpoint: string;
      apiKey: string;
    }
  | {
      mode: 'azure-openai';
      deployment: string;
      resourceName: string;
      apiKey: string;
      apiVersion: string;
      useDeploymentUrls: boolean;
    };

/**
 * Safely retrieves a required environment variable with validation.
 *
 * @param {string} name - Environment variable name
 * @returns {string} Trimmed environment variable value
 * @throws {LlmError} If environment variable is missing or empty
 *
 * @example
 * ```typescript
 * const apiKey = getRequiredEnv('AZURE_OPENAI_API_KEY');
 * ```
 */
export function getRequiredEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    throw new LlmError({ message: `Missing required env: ${name}`, category: 'VALIDATION' });
  }
  return v.trim();
}

/**
 * Factory function to create LLM client configuration from environment variables.
 *
 * Reads Azure OpenAI configuration from environment and creates a client config object.
 * Provides sensible defaults for optional parameters like API version.
 *
 * @returns {object} Object containing modelId and complete client configuration
 * @throws {LlmError} If required environment variables are missing
 *
 * @example
 * ```typescript
 * const { modelId, config } = getLlmClient();
 * const azureProvider = createAzure(config);
 * const model = azureProvider(modelId);
 * ```
 */
export function getLlmClient(): { modelId: string; config: LlmClientConfig } {
  const customEndpoint = process.env['AZURE_API_ENDPOINT']?.trim();
  const customKey = process.env['AZURE_API_KEY']?.trim();
  const customModel = process.env['AZURE_MODEL']?.trim();

  if (customEndpoint && customKey && customModel) {
    return {
      modelId: customModel,
      config: {
        mode: 'azure-custom',
        deployment: customModel,
        endpoint: customEndpoint,
        apiKey: customKey
      }
    };
  }

  const resourceName = process.env['AZURE_RESOURCE_NAME']?.trim();
  const openAiKey = process.env['AZURE_OPENAI_API_KEY']?.trim();
  const deployment = process.env['AZURE_OPENAI_DEPLOYMENT']?.trim();
  const apiVersion = (process.env['AZURE_OPENAI_API_VERSION'] as string | undefined)?.trim() || '2024-12-01-preview';
  const useDeploymentUrls = process.env['AZURE_USE_DEPLOYMENT_URLS'] === '1';

  if (resourceName && openAiKey && deployment) {
    return {
      modelId: deployment,
      config: {
        mode: 'azure-openai',
        deployment,
        resourceName,
        apiKey: openAiKey,
        apiVersion,
        useDeploymentUrls
      }
    };
  }

  throw new LlmError({
    message: 'Missing required env: configure either AZURE_API_* or AZURE_RESOURCE_NAME/AZURE_OPENAI_* values',
    category: 'VALIDATION'
  });
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
      const message =
        typeof anyErr.message === 'string' && anyErr.message.length > 0 ? anyErr.message : `HTTP ${status}`;
      return new LlmError({ message, category, statusCode: status, provider: 'azure_openai' });
    }
  }
  // Azure/OpenAI HTTP errors may bubble with Response-like info in message; we treat unknown as SERVER
  return err;
}

function jitter(base: number, spread = 200) {
  /**
   * Adds small random jitter (0..spread) to a base delay to avoid
   * synchronized retries (thundering herd). Used by retry backoff.
   */
  const j = Math.floor(Math.random() * spread);
  return base + j;
}

function log(fields: Record<string, unknown>) {
  /**
   * Best-effort structured logging wrapper. Intentionally swallows
   * serialization failures to avoid masking the real error paths.
   */
  try {
    const base = { timestamp: new Date().toISOString(), ...fields };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(base));
  } catch {}
}

/**
 * Attempts to repair malformed JSON using the jsonrepair library.
 * The jsonrepair library handles many edge cases including:
 * - Missing quotes around keys
 * - Single quotes instead of double quotes
 * - Trailing commas
 * - Comments
 * - Code blocks
 * - Missing closing braces/brackets
 * - And many more malformed JSON patterns
 *
 * @param text - The malformed JSON text to repair
 * @returns The repaired text (or original if repair fails)
 */
function repairJsonText(text: string): string {
  if (!text || typeof text !== 'string') return text;

  try {
    // Use jsonrepair library for comprehensive JSON repair
    const repaired = jsonrepair(text.trim());
    return repaired;
  } catch (err) {
    // If jsonrepair cannot repair the text, return original
    // This will allow the error to propagate with full details
    log({
      status: 'jsonrepair_failed',
      error: err instanceof Error ? err.message : String(err),
      textLength: text.length,
      textPreview: clipUnknown(text, 500)
    });
    return text;
  }
}

/**
 * Simplified chat message interface for text-only prompts.
 * Used for building conversation context for structured generation.
 */
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * Options for LLM API calls with structured generation.
 * Supports Zod schema validation, timeouts, and retry configuration.
 */
export type CallLlmOptions<T> = {
  /** Array of chat messages forming the conversation context */
  messages: ChatMessage[];
  /** Zod schema for structured output validation (required for generateObject) */
  schema?: z.ZodType<T>;
  /** Request timeout in milliseconds (default: 30s) */
  timeoutMs?: number;
  /** Maximum number of retry attempts (default: 2) */
  maxRetries?: number;
  /** Name for the Langfuse generation span (e.g., 'type-classification', 'field-extraction') */
  generationName?: string;
  /** Metadata to attach to the Langfuse generation span */
  metadata?: Record<string, any>;
};

/**
 * Result type for LLM API calls with success/failure discrimination.
 * Provides typed responses with usage metrics and error handling.
 */
export type CallLlmResult<T = unknown> =
  | {
      /** Indicates successful completion */
      success: true;
      /** Typed object when schema is provided (required for structured generation) */
      data: T;
      /** Token usage metrics for cost tracking */
      usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
      /** Total request duration in milliseconds */
      durationMs: number;
    }
  | {
      /** Indicates failure */
      success: false;
      /** Categorized error with retry information */
      error: LlmError;
      /** Duration until failure in milliseconds */
      durationMs: number;
    };

export async function callLlm<T = unknown>(opts: CallLlmOptions<T>): Promise<CallLlmResult<T>> {
  const t0 = Date.now();
  let modelId: string;
  let config: LlmClientConfig;
  try {
    // 1) Load provider configuration from environment variables.
    //    Supports either Azure native (azure-custom) or Azure OpenAI compatible (azure-openai).
    const loaded = getLlmClient();
    modelId = loaded.modelId;
    config = loaded.config;
  } catch (e) {
    const err =
      e instanceof LlmError
        ? e
        : new LlmError({ message: (e as any)?.message ?? 'LLM config error', category: 'VALIDATION' });
    return { success: false, error: err, durationMs: Date.now() - t0 };
  }

  const providerName = config.mode === 'azure-custom' ? 'azure_custom' : 'azure_openai';

  let model: any;
  if (config.mode === 'azure-custom') {
    // Create a provider bound to Azure AI endpoint (non-OpenAI compatible surface)
    const azureProvider = createAzureCustom({
      apiKey: config.apiKey,
      endpoint: config.endpoint
    });
    model = azureProvider(modelId);
  } else {
    // Create a provider bound to Azure OpenAI-compatible deployment URLs
    const azureProvider = createAzureOpenAI({
      resourceName: config.resourceName,
      apiKey: config.apiKey,
      apiVersion: config.apiVersion,
      useDeploymentBasedUrls: config.useDeploymentUrls
    });
    model = azureProvider(modelId);
  }

  // 2) Configure timeouts and retry policy (exponential-ish backoff with jitter)
  const timeoutMs =
    Number.isFinite(opts.timeoutMs) && (opts.timeoutMs as number) > 0 ? (opts.timeoutMs as number) : 30_000;
  const maxRetries = Number.isFinite(opts.maxRetries) ? Math.max(0, Math.trunc(opts.maxRetries as number)) : 2;

  const attempts = [500, 1000, 2000, 4000, 4000];
  let attempt = 0;

  // Create Langfuse generation span if client is available
  const generation = langfuse?.generation({
    name: opts.generationName || 'llm-call',
    model: modelId,
    modelParameters: {
      provider: providerName,
      maxTokens: 4096
    },
    input: opts.messages,
    metadata: {
      ...opts.metadata,
      timeoutMs,
      maxRetries
    }
  });

  while (true) {
    // Each attempt uses an AbortController to enforce the per-call timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
    const aStart = Date.now();
    try {
      // Structured generation requires an explicit Zod schema
      if (!opts.schema) {
        throw new LlmError({ message: 'Schema required for structured generation', category: 'VALIDATION' });
      }
      const result = await __aiFns.generateObject({
        model,
        messages: opts.messages as any,
        schema: opts.schema,
        signal: controller.signal,
        /**
         * Set maximum output tokens to ensure the model has enough capacity to generate
         * complete JSON responses for complex schemas with multiple nested fields.
         *
         * Invoice extraction generates large JSON objects with:
         * - 17-21 fields (depending on invoice type)
         * - Each field has 6 nested properties (value, confidence, reason_code, etc.)
         * - Total ~100+ individual values in the response
         *
         * 4096 tokens provides ample room for:
         * - Complete field extraction (~2000-3000 tokens)
         * - Evidence snippets and reasoning text
         * - Buffer for formatting and structure
         */
        maxTokens: 4096,
        experimental_transform: {
          // Clean up markdown-wrapped JSON if LLM ignores instructions
          response: (text: string) => {
            if (typeof text === 'string' && text.trim().startsWith('```json')) {
              return text
                .replace(/^```json\s*/i, '')
                .replace(/```\s*$/i, '')
                .trim();
            }
            return text;
          }
        },
        experimental_repairText: async ({ text, error: _error }) => {
          // Attempt to repair malformed JSON when parsing/validation fails
          const repaired = repairJsonText(text);
          log({
            provider: providerName,
            model: modelId,
            attempt,
            status: 'repair_attempt',
            originalTextLength: text.length,
            repairedTextLength: repaired.length,
            repairApplied: repaired !== text
          });
          return repaired;
        }
      });
      clearTimeout(timer);
      const durationMs = Date.now() - t0;
      const usage = result.usage as any;

      // Update Langfuse generation with success data
      generation?.end({
        output: result.object,
        usage: {
          promptTokens: usage?.promptTokens,
          completionTokens: usage?.completionTokens,
          totalTokens: usage?.totalTokens
        },
        statusMessage: 'success'
      });

      // Log request/response previews for observability without dumping full bodies
      log({
        provider: providerName,
        model: modelId,
        attempt,
        status: 'request_metadata',
        requestBodyPreview: clipUnknown(result.request?.body, 2000),
        responseBodyPreview: clipUnknown(result.response?.body, 2000)
      });
      log({
        provider: providerName,
        model: modelId,
        attempt,
        durationMs: Date.now() - aStart,
        status: 'ok',
        tokens: usage?.totalTokens
      });
      return { success: true, data: result.object as T, usage, durationMs };
    } catch (e) {
      clearTimeout(timer);
      let caught: unknown = e;

      // Handle NoObjectGeneratedError specifically with detailed logging
      if (NoObjectGeneratedError.isInstance(caught)) {
        const noObjError = caught as NoObjectGeneratedError;
        const usage = noObjError.usage as any;

        // Log comprehensive error details
        log({
          provider: providerName,
          model: modelId,
          attempt,
          status: 'no_object_generated',
          errorType: 'NoObjectGeneratedError',
          text: clipUnknown(noObjError.text, 5000), // Log generated text (may be malformed JSON)
          textLength: noObjError.text?.length ?? 0,
          response: {
            id: noObjError.response?.id,
            timestamp: noObjError.response?.timestamp,
            modelId: noObjError.response?.modelId
          },
          usage: {
            promptTokens: usage?.promptTokens,
            completionTokens: usage?.completionTokens,
            totalTokens: usage?.totalTokens
          },
          cause:
            noObjError.cause instanceof Error
              ? {
                  name: noObjError.cause.name,
                  message: noObjError.cause.message,
                  stack: noObjError.cause.stack?.split('\n').slice(0, 5).join('\n') // First 5 lines of stack
                }
              : String(noObjError.cause)
        });

        // Update Langfuse generation with error details
        const langfuseEndOptions: any = {
          level: 'ERROR',
          statusMessage: 'NoObjectGeneratedError: response did not match schema',
          output: {
            error: 'NoObjectGeneratedError',
            textPreview: clipUnknown(noObjError.text, 1000),
            cause: noObjError.cause instanceof Error ? noObjError.cause.message : String(noObjError.cause)
          },
          metadata: {
            errorType: 'NoObjectGeneratedError',
            textLength: noObjError.text?.length ?? 0,
            responseId: noObjError.response?.id,
            attemptsMade: attempt + 1
          }
        };

        // Add usage if available
        if (usage) {
          langfuseEndOptions.usage = {
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens
          };
        }

        generation?.end(langfuseEndOptions);

        // Create a categorized error for consistent error handling
        const schemaError = new LlmError({
          message: `No object generated: response did not match schema. Cause: ${noObjError.cause instanceof Error ? noObjError.cause.message : String(noObjError.cause)}`,
          category: 'SCHEMA_VALIDATION',
          provider: providerName
        });

        // Don't retry schema validation errors - they're unlikely to succeed on retry
        return { success: false, error: schemaError, durationMs: Date.now() - t0 };
      }

      // If the AI SDK exposes request/response bodies on error, capture short previews
      if (caught && typeof caught === 'object') {
        const req = (caught as any).request?.body;
        const res = (caught as any).response?.body;
        if (req !== undefined || res !== undefined) {
          log({
            provider: providerName,
            model: modelId,
            attempt,
            status: 'request_metadata_error',
            requestBodyPreview: clipUnknown(req, 2000),
            responseBodyPreview: clipUnknown(res, 2000)
          });
        }
      }

      const err = mapError(caught);
      if (err instanceof LlmError) {
        if (!err.provider) err.provider = providerName;
        // Decide retry based on category (QUOTA/TIMEOUT/SERVER are transient)
        const retryable = err.category === 'QUOTA' || err.category === 'TIMEOUT' || err.category === 'SERVER';
        log({ provider: providerName, model: modelId, attempt, status: 'error', category: err.category });
        if (retryable && attempt < maxRetries) {
          const idx = Math.min(attempt, attempts.length - 1);
          await new Promise(res => setTimeout(res, jitter(attempts[idx] ?? 0)));
          attempt++;
          continue;
        }
        // Record error in Langfuse before returning
        generation?.end({
          level: 'ERROR',
          statusMessage: `${err.category}: ${err.message}`,
          metadata: {
            errorCategory: err.category,
            statusCode: err.statusCode,
            requestId: err.requestId,
            attemptsMade: attempt + 1
          }
        });
        return { success: false, error: err, durationMs: Date.now() - t0 };
      }
      // Unknown error, try to map HTTPish status if present
      const message = caught instanceof Error ? caught.message : 'Unknown LLM error';
      // Try to detect HTTP status embedded in error
      let category: LlmErrorCategory = 'SERVER';
      if (/\b(400)\b/.test(message)) category = 'VALIDATION';
      else if (/\b(401|403)\b/.test(message)) category = 'AUTH';
      else if (/\b429\b/.test(message)) category = 'QUOTA';
      else if (/\b(5\d\d)\b/.test(message)) category = 'SERVER';
      const wrapped = new LlmError({ message, category, provider: providerName });
      log({ provider: providerName, model: modelId, attempt, status: 'error', category: wrapped.category });
      // Only retry if the derived category appears transient
      if ((wrapped.category === 'QUOTA' || wrapped.category === 'SERVER') && attempt < maxRetries) {
        const idx = Math.min(attempt, attempts.length - 1);
        await new Promise(res => setTimeout(res, jitter(attempts[idx] ?? 0)));
        attempt++;
        continue;
      }
      // Record error in Langfuse before returning
      generation?.end({
        level: 'ERROR',
        statusMessage: `${wrapped.category}: ${wrapped.message}`,
        metadata: {
          errorCategory: wrapped.category,
          attemptsMade: attempt + 1
        }
      });
      return { success: false, error: wrapped, durationMs: Date.now() - t0 };
    }
  }
}

/**
 * Configuration for weighted confidence calculation across different field types.
 * Allows customization of how much each field category contributes to overall confidence.
 */
export interface ConfidenceWeights {
  /** Weight for monetary amount fields (invoice_*_amount) */
  amounts?: number;
  /** Weight for date fields (*_date) */
  dates?: number;
  /** Weight for identifier fields (invoice_number, policy_number, account_number) */
  identifiers?: number;
  /** Weight for address fields (payment_remittance_*) */
  addresses?: number;
  /** Weight for name fields (vendor_name, community_name, etc.) */
  names?: number;
  /** Weight for validation fields (valid_input) */
  validation?: number;
  /** Default weight for uncategorized fields */
  default?: number;
}

/**
 * Options for structured extraction with confidence customization.
 */
export interface ExtractStructuredOptions {
  /** Custom weights for confidence calculation */
  confidenceWeights?: ConfidenceWeights;
}

/**
 * Per-field confidence score mapping.
 * Maps field names to their calculated confidence scores (0-1).
 */
export type PerFieldConfidence = Record<string, number>;

/**
 * Result of structured extraction with data, tokens, and confidence.
 */
export type ExtractStructuredResult<T> = {
  /** Extracted and normalized structured data */
  data: T;
  /** Total tokens used for cost tracking */
  tokensUsed?: number | undefined;
  /** Overall calculated confidence score (0-1) - weighted average of all fields */
  confidence?: number | undefined;
  /** Per-field confidence scores (0-1) for each extracted field */
  perFieldConfidence?: PerFieldConfidence | undefined;
};

/**
 * High-level function for structured data extraction from invoice markdown.
 *
 * This function combines LLM inference with data normalization and confidence calculation
 * to provide a complete extraction pipeline. It includes optimized prompting for invoice
 * data extraction with reasoning and confidence per field.
 *
 * @param {z.ZodType<T>} schema - Zod schema defining the expected output structure
 * @param {object} input - Input containing markdown text to extract from
 * @param {ExtractStructuredOptions} options - Optional configuration for confidence weights
 * @returns {Promise<ExtractStructuredResult<T>>} Structured data with confidence and token usage
 *
 * @example
 * ```typescript
 * const result = await extractStructured(InvoiceSchema, { markdown: ocrText });
 * console.log(`Confidence: ${result.confidence}, Tokens: ${result.tokensUsed}`);
 * ```
 */
export async function extractStructured<T>(
  schema: z.ZodType<T>,
  input: { markdown: string },
  options?: ExtractStructuredOptions
): Promise<ExtractStructuredResult<T>> {
  // Build consistent system+user messages using shared prompt helper
  // Keeps normalization/disambiguation and output contract centralized
  const { buildInvoiceExtractionPrompt } = await import('./prompts/invoice.js');
  const messages: ChatMessage[] = buildInvoiceExtractionPrompt(input.markdown);

  // Call the LLM with structured output enforced by the provided Zod schema.
  // Timeout and retries are tuned for OCR-like, longer prompts.
  const result = await callLlm({
    messages,
    schema,
    timeoutMs: 60000, // 60 seconds for complex extraction
    maxRetries: 3
  });

  if (!result.success) {
    throw result.error;
  }

  // Apply minimal normalization to improve downstream consistency (trim strings,
  // coerce numeric-looking amount strings to numbers).
  const normalizedData = normalizeExtractedData(result.data as T);

  // Extract invoice type if available (for type-specific required fields)
  const invoiceType = (normalizedData as any)?.invoice_type?.value;

  // Calculate confidence scores (both overall and per-field)
  // Pass invoice type to only penalize missing required fields for that type
  const confidenceResult = calculateWeightedConfidence(normalizedData, options?.confidenceWeights, invoiceType);

  return {
    data: normalizedData,
    tokensUsed: result.usage?.totalTokens,
    confidence: confidenceResult.overall,
    perFieldConfidence: confidenceResult.perField
  };
}

/**
 * Result of two-stage invoice extraction with type classification.
 */
export interface InvoiceExtractionWithTypeResult<T> extends ExtractStructuredResult<T> {
  /** Classified invoice type from first stage */
  invoiceType: string;
  /** Total tokens used across both stages */
  totalTokensUsed?: number;
}

/**
 * Two-stage invoice extraction with type classification.
 *
 * This function implements a two-stage LLM extraction pipeline:
 * 1. Stage 1: Classify invoice type (general, insurance, utility, tax)
 * 2. Stage 2: Extract fields using type-specific schema
 *
 * The type classification determines which schema is used in stage 2, ensuring
 * only relevant fields are extracted. This approach:
 * - Reduces token usage by using smaller, focused schemas
 * - Prevents hallucination on irrelevant fields
 * - Provides stronger validation and type safety
 * - Makes extraction more deterministic
 *
 * @param {string} markdown - OCR-extracted markdown text from invoice document
 * @param {ExtractStructuredOptions} options - Optional configuration for confidence weights
 * @returns {Promise<InvoiceExtractionWithTypeResult<T>>} Extraction results with invoice type
 *
 * @example
 * ```typescript
 * const result = await extractInvoiceWithTypeDetection(ocrText);
 * console.log(`Type: ${result.invoiceType}, Confidence: ${result.confidence}`);
 * // For insurance: extracts vendor fields + policy_start_date, policy_end_date, policy_number, service_termination
 * // For general: extracts only vendor fields
 * ```
 */
export async function extractInvoiceWithTypeDetection(
  markdown: string,
  options?: ExtractStructuredOptions
): Promise<InvoiceExtractionWithTypeResult<any>> {
  // Stage 1: Classify invoice type
  const { InvoiceTypeSchema } = await import('./schemas/invoice-type.js');
  const { buildInvoiceTypeClassificationPrompt } = await import('./prompts/invoice-type.js');

  const typeMessages = buildInvoiceTypeClassificationPrompt(markdown);
  const typeResult = await callLlm({
    messages: typeMessages,
    schema: InvoiceTypeSchema,
    timeoutMs: 30000, // 30 seconds for classification
    maxRetries: 2,
    generationName: 'invoice-type-classification',
    metadata: {
      stage: 'type-detection',
      inputLength: markdown.length
    }
  });

  if (!typeResult.success) {
    throw typeResult.error;
  }

  const invoiceType = typeResult.data.invoice_type;
  const typeTokens = typeResult.usage?.totalTokens ?? 0;

  // Stage 2: Build type-specific schema and extract invoice data
  const { buildInvoiceSchemaForType } = await import('./schemas/invoice.js');

  /**
   * Select the appropriate type-specific prompt builder based on classified invoice type.
   *
   * Type-specific prompts provide significant advantages over a unified prompt:
   *
   * 1. Token Efficiency: Each prompt only includes rules for relevant fields, reducing
   *    prompt size by ~25-30% compared to a unified prompt containing all type rules.
   *    This reduces both cost and latency for LLM API calls.
   *
   * 2. Improved LLM Focus: By presenting only applicable field extraction rules, the
   *    LLM can focus on the task without distraction from irrelevant field guidance.
   *    This reduces cognitive load and improves extraction quality.
   *
   * 3. Lower Hallucination Risk: Excluding rules for fields that aren't in the schema
   *    prevents the LLM from attempting to extract or reason about irrelevant fields,
   *    reducing the chance of confusing similar fields across types.
   *
   * 4. Per-Type Optimization: Each prompt can be independently tuned and improved
   *    based on performance metrics for that specific invoice type without affecting
   *    extraction quality for other types.
   *
   * 5. Clearer Instructions: Type-specific terminology and examples make the extraction
   *    task clearer. E.g., insurance prompts use "policy period" vs "service period"
   *    vs "tax year" terminology appropriate to each domain.
   *
   * Prompt Selection Strategy:
   * - general: Standard vendor invoices (17 base fields only)
   * - insurance: Vendor fields + policy_start_date, policy_end_date, policy_number, service_termination
   * - utility: Vendor fields + service_start_date, service_end_date, service_termination
   * - tax: Vendor fields + tax_year, property_id
   *
   * The prompt builder functions all return ChatMessage[] with identical structure,
   * differing only in the field-specific extraction rules included in the system message.
   */
  const promptBuilders = {
    general: async () => {
      const { buildGeneralInvoicePrompt } = await import('./prompts/invoice-general.js');
      return buildGeneralInvoicePrompt(markdown);
    },
    insurance: async () => {
      const { buildInsuranceInvoicePrompt } = await import('./prompts/invoice-insurance.js');
      return buildInsuranceInvoicePrompt(markdown);
    },
    utility: async () => {
      const { buildUtilityInvoicePrompt } = await import('./prompts/invoice-utility.js');
      return buildUtilityInvoicePrompt(markdown);
    },
    tax: async () => {
      const { buildTaxInvoicePrompt } = await import('./prompts/invoice-tax.js');
      return buildTaxInvoicePrompt(markdown);
    }
  };

  // Create schema with only relevant fields for this invoice type
  const typeSpecificSchema = buildInvoiceSchemaForType(invoiceType);

  /**
   * Dynamically load and execute the appropriate prompt builder for this invoice type.
   * This ensures we only load the prompt module we need, keeping bundle size minimal.
   */
  const extractMessages = await promptBuilders[invoiceType]();
  const extractResult = await callLlm({
    messages: extractMessages,
    schema: typeSpecificSchema,
    timeoutMs: 60000, // 60 seconds for extraction
    maxRetries: 3,
    generationName: 'invoice-field-extraction',
    metadata: {
      stage: 'field-extraction',
      invoiceType,
      inputLength: markdown.length
    }
  });

  if (!extractResult.success) {
    throw extractResult.error;
  }

  const extractTokens = extractResult.usage?.totalTokens ?? 0;
  const normalizedData = normalizeExtractedData(extractResult.data);

  // Inject invoice_type into the extracted data with high confidence
  // since it was determined in a separate classification stage
  const dataWithType = {
    ...normalizedData,
    invoice_type: {
      value: invoiceType,
      confidence: 'high' as const,
      reason_code: 'explicit_label' as const,
      reasoning: 'Determined via dedicated classification stage'
    }
  };

  // Calculate confidence scores (both overall and per-field)
  // Pass invoice type to only penalize missing required fields for that type
  const confidenceResult = calculateWeightedConfidence(dataWithType, options?.confidenceWeights, invoiceType);

  return {
    invoiceType,
    data: dataWithType,
    tokensUsed: extractTokens,
    totalTokensUsed: typeTokens + extractTokens,
    confidence: confidenceResult.overall,
    perFieldConfidence: confidenceResult.perField
  };
}

function clipString(value: string, max = 2000): string {
  if (typeof value !== 'string') return '';
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function clipUnknown(value: unknown, max = 2000): string | null {
  if (value === null || value === undefined) return null;
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return clipString(str, max);
}

function normalizeExtractedData<T>(data: T): T {
  /**
   * Performs lightweight, lossless normalization on the model output:
   * - Trims string values to remove accidental whitespace
   * - For fields that look like monetary amounts, safely coerces numeric-like
   *   strings to numbers (preserves null/undefined and non-finite values)
   */
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
  /**
   * Heuristically map a field name to a confidence weight category.
   * This allows weighting certain field types (amounts, dates, IDs, etc.)
   * more heavily when computing an overall confidence score.
   */
  if (fieldName.includes('amount')) return 'amounts';
  if (fieldName.includes('date')) return 'dates';
  if (['invoice_number', 'policy_number', 'account_number'].includes(fieldName)) return 'identifiers';
  if (fieldName.startsWith('payment_remittance_')) return 'addresses';
  if (['vendor_name', 'community_name'].includes(fieldName)) return 'names';
  if (fieldName === 'valid_input') return 'validation';
  return 'default';
}

/**
 * Calculates a numeric confidence score (0-1) for a single field using both
 * confidence level and reason_code. The reason_code provides additional
 * context that refines the confidence score beyond the basic high/medium/low mapping.
 *
 * Scoring Strategy:
 * - Base score from confidence level (high=0.9, medium=0.6, low=0.3)
 * - Adjustments based on reason_code:
 *   - explicit_label: Boost by 5% (most reliable)
 *   - nearby_header: Keep base score (good context)
 *   - inferred_layout: Reduce by 10% (less reliable)
 *   - conflict: Heavy penalty (50% reduction) - indicates uncertainty
 *   - missing: Zero score (no data available)
 *
 * @param {string | null | undefined} confidence - Field confidence level ('high' | 'medium' | 'low')
 * @param {string | undefined} reasonCode - Extraction method reason code
 * @returns {number} Numeric confidence score between 0 and 1
 *
 * @example
 * ```typescript
 * // High confidence with explicit label = highest score
 * calculateFieldConfidenceScore('high', 'explicit_label') // ~0.945
 *
 * // High confidence but inferred = lower score
 * calculateFieldConfidenceScore('high', 'inferred_layout') // ~0.81
 *
 * // Conflict always gets heavy penalty
 * calculateFieldConfidenceScore('medium', 'conflict') // ~0.3
 * ```
 */
function calculateFieldConfidenceScore(confidence: string | null | undefined, reasonCode?: string): number {
  // Base score from confidence level
  let baseScore = 0;
  if (confidence === 'high') baseScore = 0.9;
  else if (confidence === 'medium') baseScore = 0.6;
  else if (confidence === 'low') baseScore = 0.3;
  else return 0; // null/undefined confidence = 0

  // Adjust based on reason_code
  if (reasonCode === 'explicit_label') {
    // Explicit labels are most reliable - small boost
    return Math.min(1.0, baseScore * 1.05);
  } else if (reasonCode === 'nearby_header') {
    // Nearby header is good context - keep base score
    return baseScore;
  } else if (reasonCode === 'inferred_layout') {
    // Inferred from layout is less reliable - reduce score
    return baseScore * 0.9;
  } else if (reasonCode === 'conflict') {
    // Conflicts indicate uncertainty - heavy penalty
    return baseScore * 0.5;
  } else if (reasonCode === 'missing') {
    // Missing field = no confidence
    return 0;
  }

  // If reason_code is not provided or unknown, use base score
  // (fallback for backward compatibility)
  return baseScore;
}

/**
 * Required fields for each invoice type.
 * Only missing REQUIRED fields should penalize overall confidence.
 * Optional fields that are missing should not affect the score.
 */
const REQUIRED_FIELDS_BY_TYPE: Record<string, readonly string[]> = {
  general: [
    'vendor_name', // Who issued the invoice
    'total_amount_due', // How much to pay
    'invoice_date', // When invoice was issued
    'valid_input' // Must be true for valid invoice
  ] as const,
  insurance: [
    'vendor_name',
    'total_amount_due',
    'invoice_date',
    'valid_input',
    'policy_number', // Insurance-specific: policy identifier
    'policy_start_date', // Insurance-specific: coverage start
    'policy_end_date' // Insurance-specific: coverage end
  ] as const,
  utility: [
    'vendor_name',
    'total_amount_due',
    'invoice_date',
    'valid_input',
    'service_start_date', // Utility-specific: service period start
    'service_end_date' // Utility-specific: service period end
  ] as const,
  tax: [
    'vendor_name',
    'total_amount_due',
    'invoice_date',
    'valid_input',
    'tax_year', // Tax-specific: assessment year
    'property_id' // Tax-specific: property identifier
  ] as const
};

/**
 * Gets the list of required fields for a given invoice type.
 * Falls back to general requirements if type is unknown.
 */
function getRequiredFieldsForType(invoiceType: string): string[] {
  const fields = REQUIRED_FIELDS_BY_TYPE[invoiceType];
  if (fields) {
    return [...fields];
  }
  // Fallback to general fields (guaranteed to exist)
  const generalFields = REQUIRED_FIELDS_BY_TYPE['general'];
  if (!generalFields) {
    // This should never happen, but TypeScript needs this check
    return ['vendor_name', 'total_amount_due', 'invoice_date', 'valid_input'];
  }
  return [...generalFields];
}

/**
 * Result of confidence calculation including both overall and per-field scores.
 */
export interface ConfidenceCalculationResult {
  /** Overall weighted confidence score (0-1) */
  overall: number;
  /** Per-field confidence scores (0-1) */
  perField: PerFieldConfidence;
}

function calculateWeightedConfidence<T>(
  data: T,
  weights?: ConfidenceWeights,
  invoiceType?: string
): ConfidenceCalculationResult {
  /**
   * Compute both overall and per-field confidence scores using weighted average.
   * Field-level scores are calculated using both confidence level AND reason_code
   * to provide more accurate assessment of extraction quality.
   *
   * Key Strategy:
   * - Calculate per-field confidence scores for ALL fields
   * - Only REQUIRED fields (based on invoice type) contribute to overall score
   * - Missing optional fields don't penalize the overall confidence
   * - Missing required fields significantly reduce overall confidence
   *
   * Weights can be customized per category; defaults emphasize monetary
   * amounts and dates as generally more critical in invoices.
   */
  const perFieldConfidence: PerFieldConfidence = {};

  if (!data || typeof data !== 'object') {
    return { overall: 0, perField: perFieldConfidence };
  }

  // Determine required fields based on invoice type
  const requiredFields: string[] = invoiceType
    ? getRequiredFieldsForType(invoiceType)
    : getRequiredFieldsForType('general');

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

  // Track all field scores and required field scores separately
  const allFieldScores: Array<{ score: number; weight: number; isRequired: boolean }> = [];
  const requiredFieldScores: Array<{ score: number; weight: number; fieldName: string }> = [];

  for (const [fieldName, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'confidence' in value) {
      const fieldData = value as any;
      const confidenceLevel = fieldData.confidence;
      const reasonCode = fieldData.reason_code;

      // Calculate field score using both confidence and reason_code
      const fieldScore = calculateFieldConfidenceScore(confidenceLevel, reasonCode);
      perFieldConfidence[fieldName] = fieldScore;

      const category = getFieldCategory(fieldName);
      const weight = finalWeights[category];

      const isRequired = requiredFields.includes(fieldName);
      allFieldScores.push({ score: fieldScore, weight, isRequired });

      if (isRequired) {
        requiredFieldScores.push({ score: fieldScore, weight, fieldName });
      }
    }
  }

  // Check for missing required fields
  const missingRequiredFields: string[] = [];
  for (const requiredField of requiredFields) {
    if (!(requiredField in perFieldConfidence)) {
      // Field is required but not present in extracted data
      missingRequiredFields.push(requiredField);
      // Add zero score for missing required field (heavy penalty)
      const category = getFieldCategory(requiredField);
      const weight = finalWeights[category];
      requiredFieldScores.push({ score: 0, weight, fieldName: requiredField });
    }
  }

  if (requiredFieldScores.length === 0) {
    // No required fields found - return low confidence
    return { overall: 0, perField: perFieldConfidence };
  }

  // Calculate weighted average ONLY for required fields
  const totalWeightedScore = requiredFieldScores.reduce((sum, item) => sum + item.score * item.weight, 0);
  const totalWeight = requiredFieldScores.reduce((sum, item) => sum + item.weight, 0);

  // Overall confidence is based on required fields only
  // Missing required fields already contribute 0 score, which reduces overall
  const overallConfidence = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;

  return {
    overall: overallConfidence,
    perField: perFieldConfidence
  };
}

// no export of deprecated CoreMessage

// Test seam for injecting AI SDK functions in unit tests without ESM namespace spying
type AiFns = {
  generateObject: typeof generateObject;
};

let __aiFns: AiFns = { generateObject };

export function __setAiFns(fns: Partial<AiFns>) {
  /**
   * Test seam: override AI SDK functions (e.g., generateObject) in unit tests
   * without relying on ESM mocking. Only intended for testing.
   */
  __aiFns = { ...__aiFns, ...fns };
}

export function __resetAiFns() {
  /**
   * Restore AI SDK function bindings to their production defaults.
   * Complements __setAiFns within the test lifecycle.
   */
  __aiFns = { generateObject };
}
