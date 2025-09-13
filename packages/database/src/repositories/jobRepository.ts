import { DatabaseClient } from '..';
import { Job, JobStatus } from '../models/job';

export class JobRepository {
  constructor(private readonly db: DatabaseClient) {}

  create(clientId: string | null, pdfUrl: string): Promise<Job> {
    return this.db.createJob({ clientId, pdfUrl });
  }

  findById(id: string): Promise<Job | null> {
    return this.db.getJobById(id);
  }

  listByClient(clientId: string, limit = 50, status?: JobStatus): Promise<Job[]> {
    const opts: { limit?: number; status?: JobStatus } = { limit };
    if (status !== undefined) {
      opts.status = status;
    }
    return this.db.listJobsByClient(clientId, opts);
  }

  updateStatus(
    id: string,
    status: JobStatus,
    errorMessage?: string | null,
    completedAt?: Date | null
  ): Promise<Job | null> {
    return this.db.updateJobStatus(id, status, errorMessage, completedAt);
  }
}
