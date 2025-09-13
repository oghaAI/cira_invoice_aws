// Database package entry point
// This is a placeholder for the project setup story
// Actual database schema and queries will be added in subsequent stories

export const DATABASE_VERSION = '1.1.0';

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

export interface JobResult {
  id: string;
  jobId: string;
  extractedData: unknown | null;
  confidenceScore: number | null;
  tokensUsed: number | null;
  createdAt: Date;
}

export interface DatabaseClientConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean;
}

import { Pool } from 'pg';

export class DatabaseClient {
  private readonly pool: Pool;

  constructor(config?: DatabaseClientConfig) {
    const connectionString = config?.connectionString;
    this.pool = new Pool(
      connectionString
        ? { connectionString, ssl: config?.ssl ?? true, max: 10 }
        : {
            host: config?.host,
            port: config?.port,
            database: config?.database,
            user: config?.user,
            password: config?.password,
            ssl: config?.ssl ?? true,
            max: 10
          }
    );
  }

  async end(): Promise<void> {
    await this.pool.end();
  }

  // Jobs
  async createJob(params: { clientId: string | null; pdfUrl: string }): Promise<Job> {
    const query = `
      INSERT INTO jobs (client_id, pdf_url)
      VALUES ($1, $2)
      RETURNING id, client_id, status, pdf_url, created_at, updated_at, completed_at, error_message
    `;

    const result = await this.pool.query(query, [params.clientId, params.pdfUrl]);
    const row = result.rows[0];
    return this.mapJob(row);
  }

  async getJobById(id: string): Promise<Job | null> {
    const query = `
      SELECT id, client_id, status, pdf_url, created_at, updated_at, completed_at, error_message
      FROM jobs
      WHERE id = $1
    `;
    const result = await this.pool.query(query, [id]);
    if (result.rowCount === 0) return null;
    return this.mapJob(result.rows[0]);
  }

  async listJobsByClient(clientId: string, options?: { limit?: number; status?: JobStatus }): Promise<Job[]> {
    const conditions: string[] = ['client_id = $1'];
    const values: unknown[] = [clientId];
    if (options?.status) {
      conditions.push('status = $2');
      values.push(options.status);
    }
    const limit = options?.limit ?? 50;

    const query = `
      SELECT id, client_id, status, pdf_url, created_at, updated_at, completed_at, error_message
      FROM jobs
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    const result = await this.pool.query(query, values as any[]);
    return result.rows.map(r => this.mapJob(r));
  }

  async updateJobStatus(
    id: string,
    status: JobStatus,
    errorMessage?: string | null,
    completedAt?: Date | null
  ): Promise<Job | null> {
    const query = `
      UPDATE jobs
      SET status = $2, error_message = $3, completed_at = $4
      WHERE id = $1
      RETURNING id, client_id, status, pdf_url, created_at, updated_at, completed_at, error_message
    `;
    const result = await this.pool.query(query, [id, status, errorMessage ?? null, completedAt ?? null]);
    if (result.rowCount === 0) return null;
    return this.mapJob(result.rows[0]);
  }

  // Job Results
  async upsertJobResult(params: {
    jobId: string;
    extractedData: unknown;
    confidenceScore: number | null;
    tokensUsed: number | null;
  }): Promise<JobResult> {
    const query = `
      INSERT INTO job_results (job_id, extracted_data, confidence_score, tokens_used)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (job_id)
      DO UPDATE SET extracted_data = EXCLUDED.extracted_data, confidence_score = EXCLUDED.confidence_score, tokens_used = EXCLUDED.tokens_used
      RETURNING id, job_id, extracted_data, confidence_score, tokens_used, created_at
    `;
    const result = await this.pool.query(query, [
      params.jobId,
      JSON.stringify(params.extractedData ?? null),
      params.confidenceScore,
      params.tokensUsed
    ]);
    const row = result.rows[0];
    return this.mapJobResult(row);
  }

  async getJobResult(jobId: string): Promise<JobResult | null> {
    const query = `
      SELECT id, job_id, extracted_data, confidence_score, tokens_used, created_at
      FROM job_results
      WHERE job_id = $1
    `;
    const result = await this.pool.query(query, [jobId]);
    if (result.rowCount === 0) return null;
    return this.mapJobResult(result.rows[0]);
  }

  private mapJob(row: any): Job {
    return {
      id: row.id,
      clientId: row.client_id,
      status: row.status,
      pdfUrl: row.pdf_url,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      errorMessage: row.error_message
    };
  }

  private mapJobResult(row: any): JobResult {
    return {
      id: row.id,
      jobId: row.job_id,
      extractedData: row.extracted_data
        ? JSON.parse(typeof row.extracted_data === 'string' ? row.extracted_data : JSON.stringify(row.extracted_data))
        : null,
      confidenceScore: row.confidence_score !== null ? Number(row.confidence_score) : null,
      tokensUsed: row.tokens_used !== null ? Number(row.tokens_used) : null,
      createdAt: new Date(row.created_at)
    };
  }
}

export async function withDatabaseClient<T>(
  config: DatabaseClientConfig | undefined,
  fn: (client: DatabaseClient) => Promise<T>
): Promise<T> {
  const client = new DatabaseClient(config);
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
