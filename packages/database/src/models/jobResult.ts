export interface JobResult {
  id: string;
  jobId: string;
  extractedData: unknown | null;
  confidenceScore: number | null;
  tokensUsed: number | null;
  createdAt: Date;
}
