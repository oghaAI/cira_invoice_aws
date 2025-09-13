export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface Job {
  id: string;
  clientId: string | null;
  status: JobStatus;
  pdfUrl: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  errorMessage: string | null;
}
