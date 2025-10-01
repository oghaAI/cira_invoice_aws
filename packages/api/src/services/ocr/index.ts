/**
 * @fileoverview OCR Service Interface and Provider Management
 *
 * This module defines the core interfaces and abstractions for OCR (Optical Character Recognition)
 * services in the CIRA Invoice Processing System. It provides a pluggable architecture for
 * different OCR providers while maintaining consistent error handling and result formatting.
 *
 * Key Features:
 * - Provider abstraction with unified interface
 * - Categorized error handling for different failure modes
 * - Flexible input support (URLs and streams)
 * - Structured metadata for monitoring and debugging
 * - Factory pattern for provider instantiation
 * - Retry logic support through error categorization
 *
 * Supported Providers:
 * - Mistral OCR API (default) - cloud-based OCR service
 * - Internal Docling OCR service - AWS-hosted Docling deployment
 *
 * @version 1.0.0
 * @author CIRA Development Team
 * @since 2025-09-15
 */

/**
 * Categories of OCR errors for proper error handling and retry logic.
 * Each category maps to specific failure modes and retry strategies.
 */
export type OcrErrorCategory = 'VALIDATION' | 'AUTH' | 'QUOTA' | 'TIMEOUT' | 'SERVER' | 'FAILED_STATUS';

/**
 * Custom error class for OCR-related operations with detailed categorization.
 * Provides structured error information for debugging, monitoring, and retry logic.
 */
export class OcrError extends Error {
  /** Error category for retry and handling logic */
  category: OcrErrorCategory;
  /** HTTP status code if applicable */
  statusCode?: number;
  /** OCR provider identifier */
  provider?: string;
  /** Request ID for tracing */
  requestId?: string | null;
  /** Original error message from underlying cause */
  causeMessage?: string;

  constructor(options: {
    message: string;
    category: OcrErrorCategory;
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
      name: 'OcrError',
      message: this.message,
      category: this.category,
      statusCode: this.statusCode,
      provider: this.provider,
      requestId: this.requestId
    } satisfies Record<string, unknown>;
  }
}

/**
 * Input configuration for OCR processing operations.
 * Supports both URL-based and stream-based inputs for flexibility.
 */
export interface OcrInput {
  /** PDF URL for remote document processing */
  pdfUrl?: string;
  /** Binary stream or buffer for direct document processing */
  stream?: ReadableStream<Uint8Array> | Buffer;
}

/**
 * Metadata accompanying OCR processing results.
 * Provides operational metrics and tracing information.
 */
export interface OcrMetadata {
  /** OCR confidence score (0-1) if provided by the service */
  confidence?: number;
  /** Number of pages processed */
  pages?: number;
  /** Processing duration in milliseconds */
  durationMs: number;
  /** OCR service provider name */
  provider: string;
  /** Request ID for tracing and debugging */
  requestId?: string | null;
  /** Document size in bytes if available */
  bytes?: number;
}

/**
 * Result of OCR processing containing extracted text and metadata.
 * The markdown format provides structured text representation of the document.
 */
export interface OcrResult {
  /** Extracted text in markdown format (UTF-8 safe) */
  markdown: string;
  /** Processing metadata and metrics */
  metadata: OcrMetadata;
}

/**
 * Interface defining the contract for OCR service providers.
 * Enables pluggable architecture for different OCR services.
 */
export interface OcrProvider {
  /** Provider name for identification and logging */
  name: string;
  /** Extract text from document input, returning UTF-8 safe markdown */
  extract(input: OcrInput): Promise<OcrResult>;
}

/**
 * Determines if an error category supports retry operations.
 *
 * @param {OcrErrorCategory} category - Error category to check
 * @returns {boolean} True if category supports retries, false otherwise
 *
 * @example
 * ```typescript
 * if (isRetryable(error.category)) {
 *   // Implement retry logic
 * }
 * ```
 */
export function isRetryable(category: OcrErrorCategory): boolean {
  return category === 'QUOTA' || category === 'TIMEOUT' || category === 'SERVER';
}

// Factory loader (kept simple for now)
import { mistralProvider } from './mistral';
import { internalProvider } from './internal';

/**
 * Factory function to get the configured OCR provider instance.
 *
 * Reads the OCR_PROVIDER environment variable to determine which provider to use.
 * Defaults to 'mistral' if not specified. Supports extensible provider architecture.
 *
 * @returns {OcrProvider} Configured OCR provider instance
 * @throws {OcrError} If unknown provider is specified
 *
 * @example
 * ```typescript
 * const provider = getOcrProvider();
 * const result = await provider.extract({ pdfUrl: 'https://example.com/doc.pdf' });
 * ```
 */
export function getOcrProvider(): OcrProvider {
  const id = ((process.env['OCR_PROVIDER'] as string | undefined) || 'internal').toLowerCase();
  switch (id) {
    case 'mistral':
      return mistralProvider();
    case 'internal':
      return internalProvider();
    default:
      throw new OcrError({ message: `Unknown OCR provider: ${id}`, category: 'VALIDATION' });
  }
}
