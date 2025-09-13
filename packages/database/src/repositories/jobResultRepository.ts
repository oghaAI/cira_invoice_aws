import { DatabaseClient } from '..';
import { JobResult } from '../models/jobResult';

export class JobResultRepository {
  constructor(private readonly db: DatabaseClient) {}

  upsert(
    jobId: string,
    extractedData: unknown,
    confidenceScore: number | null,
    tokensUsed: number | null
  ): Promise<JobResult> {
    return this.db.upsertJobResult({ jobId, extractedData, confidenceScore, tokensUsed });
  }

  findByJobId(jobId: string): Promise<JobResult | null> {
    return this.db.getJobResult(jobId);
  }
}
