export type OcrErrorCategory = 'VALIDATION' | 'AUTH' | 'QUOTA' | 'TIMEOUT' | 'SERVER' | 'FAILED_STATUS';

export class OcrError extends Error {
  category: OcrErrorCategory;
  statusCode?: number;
  provider?: string;
  requestId?: string | null;
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

export interface OcrInput {
  pdfUrl?: string;
  stream?: ReadableStream<Uint8Array> | Buffer;
}

export interface OcrMetadata {
  confidence?: number;
  pages?: number;
  durationMs: number;
  provider: string;
  requestId?: string | null;
  bytes?: number;
}

export interface OcrResult {
  markdown: string;
  metadata: OcrMetadata;
}

export interface OcrProvider {
  name: string;
  extract(input: OcrInput): Promise<OcrResult>; // Must return UTF-8 safe Markdown
}

export function isRetryable(category: OcrErrorCategory): boolean {
  return category === 'QUOTA' || category === 'TIMEOUT' || category === 'SERVER';
}

// Factory loader (kept simple for now)
import { mistralProvider } from './mistral';

export function getOcrProvider(): OcrProvider {
  const id = ((process.env['OCR_PROVIDER'] as string | undefined) || 'mistral').toLowerCase();
  switch (id) {
    case 'mistral':
      return mistralProvider();
    default:
      throw new OcrError({ message: `Unknown OCR provider: ${id}`, category: 'VALIDATION' });
  }
}
