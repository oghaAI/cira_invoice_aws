export interface JobResult {
  id: string;
  jobId: string;
  extractedData: unknown | null;
  confidenceScore: number | null;
  tokensUsed: number | null;
  rawOcrText: string | null;
  ocrProvider: string | null;
  ocrDurationMs: number | null;
  ocrPages: number | null;
  createdAt: Date;
}
