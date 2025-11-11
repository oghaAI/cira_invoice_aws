/**
 * CIRA Invoice Processing System - Database Package Entry Point
 *
 * This package provides the core database layer for the CIRA Invoice Processing System,
 * implementing a simplified PostgreSQL-based data persistence layer following the MVP
 * architecture principles outlined in docs/architecture-mvp.md.
 *
 * Key Features:
 * - Simple, direct database access pattern (no complex ORM abstractions)
 * - Type-safe operations with TypeScript interfaces
 * - Connection pooling via node-postgres (pg)
 * - JSONB storage for flexible invoice data extraction results
 * - Comprehensive job lifecycle tracking (queued → processing → completed/failed)
 *
 * Architecture Alignment:
 * - Follows "Direct Database Access Pattern" from architecture document
 * - Supports Step Functions workflow with job status tracking
 * - Integrates with OCR and LLM processing phases via job results
 * - Provides foundation for 10,000 invoices/month target processing volume
 *
 * @see docs/architecture-mvp.md - Core architecture principles
 * @see docs/stories/3.2.invoice-schema-zod.md - Invoice data schema
 */

export const DATABASE_VERSION = '1.1.0';

/**
 * Job status enumeration representing the lifecycle of an invoice processing job.
 * Aligns with Step Functions workflow states for seamless orchestration.
 */
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

/**
 * Processing phase enumeration for granular tracking within the 'processing' status.
 * Provides visibility into which step of the OCR → LLM → Complete workflow is active.
 */
export type ProcessingPhase = 'analyzing_invoice' | 'extracting_data' | 'verifying_data';

/**
 * Core Job entity representing an invoice processing request.
 * Maps to the 'jobs' table in PostgreSQL and tracks the complete lifecycle
 * from initial PDF submission through final completion or failure.
 *
 * Lifecycle Flow:
 * 1. Created with status 'queued' and pdfUrl
 * 2. Picked up by Step Functions → status becomes 'processing'
 * 3. processingPhase tracks OCR → LLM → validation steps
 * 4. Final status: 'completed' (with completedAt) or 'failed' (with errorMessage)
 */
export interface Job {
  /** Unique job identifier (UUID) */
  id: string;
  /** Optional client identifier for API key attribution and billing */
  clientId: string | null;
  /** Current job status in the processing pipeline */
  status: JobStatus;
  /** Detailed processing phase when status is 'processing' */
  processingPhase: ProcessingPhase | null;
  /** Source PDF URL to be processed */
  pdfUrl: string;
  /** Timestamp when job was initially created */
  createdAt: Date;
  /** Timestamp of last status update (auto-updated via trigger) */
  updatedAt: Date;
  /** Timestamp when job reached final state (completed/failed) */
  completedAt: Date | null;
  /** Error details if job failed, null for successful jobs */
  errorMessage: string | null;
}

/**
 * Job processing results containing both OCR outputs and LLM-extracted structured data.
 * Maps to the 'job_results' table with JSONB storage for flexible invoice schema evolution.
 *
 * Data Flow:
 * 1. OCR step populates: rawOcrText, ocrProvider, ocrDurationMs, ocrPages
 * 2. LLM step populates: extractedData (Zod-validated invoice fields), tokensUsed, confidenceScore
 * 3. Both steps can update existing records via UPSERT operations
 *
 * Storage Strategy:
 * - extractedData stored as JSONB for flexible schema evolution (Story 3.2)
 * - Supports Zod-validated invoice schemas with field_reasoning and field_confidence
 * - OCR metadata enables cost tracking and performance optimization
 */
export interface JobResult {
  /** Unique result identifier (UUID) */
  id: string;
  /** Reference to parent job (foreign key to jobs.id) */
  jobId: string;
  /**
   * Structured invoice data extracted by LLM (stored as JSONB).
   * Contains Zod-validated fields, field_reasoning, and field_confidence maps.
   * @see docs/stories/3.2.invoice-schema-zod.md
   */
  extractedData: unknown | null;
  /** Overall confidence score for the extraction (0.0-1.0 range) */
  confidenceScore: number | null;
  /** Number of tokens consumed by LLM processing (for cost tracking) */
  tokensUsed: number | null;
  /** Raw OCR text output (stored for debugging and re-processing) */
  rawOcrText: string | null;
  /** OCR service identifier (e.g., "docling", "textract") */
  ocrProvider: string | null;
  /** OCR processing duration in milliseconds (for performance monitoring) */
  ocrDurationMs: number | null;
  /** Number of pages processed by OCR (for billing and complexity assessment) */
  ocrPages: number | null;
  /** Timestamp when result was created/last updated */
  createdAt: Date;
}

/**
 * Database connection configuration supporting both connection string and discrete parameters.
 * Provides flexibility for different deployment environments (local dev, Lambda, RDS).
 *
 * Connection Strategies:
 * - Connection string: Preferred for production (supports RDS connection strings)
 * - Discrete parameters: Useful for development and testing environments
 * - SSL enabled by default for production security requirements
 */
export interface DatabaseClientConfig {
  /** Complete PostgreSQL connection string (preferred for production) */
  connectionString?: string;
  /** Database host (when not using connection string) */
  host?: string;
  /** Database port (default: 5432) */
  port?: number;
  /** Database name */
  database?: string;
  /** Database username */
  user?: string;
  /** Database password */
  password?: string;
  /** Enable SSL connections (default: true for security) */
  ssl?: boolean;
}

import { Pool } from 'pg';

/**
 * Database client interface defining all data access operations for the CIRA system.
 * Provides a clean abstraction over PostgreSQL operations with support for:
 * - Job lifecycle management (create, read, update status)
 * - Processing phase tracking for Step Functions integration
 * - Job results with OCR and LLM data storage
 * - Connection management and health monitoring
 *
 * Design Principles:
 * - Simple, direct SQL operations (no complex ORM patterns)
 * - Type-safe method signatures with comprehensive error handling
 * - Optimized for Lambda function usage with connection pooling
 * - UPSERT operations for handling partial updates from different processing steps
 */
export interface IDatabaseClient {
  /** Connection lifecycle management */
  end(): Promise<void>;

  /** Database connectivity health check */
  healthCheck(): Promise<boolean>;

  /** Create new invoice processing job */
  createJob(params: { clientId: string | null; pdfUrl: string }): Promise<Job>;
  /** Retrieve job by unique identifier */
  getJobById(id: string): Promise<Job | null>;
  /** List jobs for a specific client with optional filtering */
  listJobsByClient(clientId: string, options?: { limit?: number; status?: JobStatus }): Promise<Job[]>;
  /** Update job status with optional error message and completion timestamp */
  updateJobStatus(id: string, status: JobStatus, errorMessage?: string | null, completedAt?: Date | null): Promise<Job | null>;
  /** Mark job as processing (used by Step Functions initiation) */
  setJobStatusProcessing(id: string): Promise<Job | null>;
  /** Update processing phase for granular progress tracking */
  setJobProcessingPhase(id: string, phase: ProcessingPhase): Promise<Job | null>;
  /** Clear processing phase (typically on completion or failure) */
  clearJobProcessingPhase(id: string): Promise<Job | null>;

  /**
   * Upsert job result data (supports partial updates from OCR and LLM steps).
   * Uses COALESCE to preserve existing data when new fields are null.
   */
  upsertJobResult(params: {
    jobId: string;
    extractedData?: unknown | null;
    confidenceScore?: number | null;
    tokensUsed?: number | null;
    rawOcrText?: string | null;
    ocrProvider?: string | null;
    ocrDurationMs?: number | null;
    ocrPages?: number | null;
  }): Promise<JobResult>;
  /** Retrieve complete job result by job ID */
  getJobResult(jobId: string): Promise<JobResult | null>;
}

/**
 * Concrete implementation of the database client using node-postgres (pg) connection pooling.
 *
 * Key Features:
 * - Connection pooling (max 10 connections) for Lambda efficiency
 * - SSL-by-default for production security
 * - Flexible configuration supporting both connection strings and discrete parameters
 * - Type-safe row mapping between PostgreSQL and TypeScript interfaces
 * - Comprehensive error handling with proper resource cleanup
 *
 * Usage Patterns:
 * - Lambda functions: Create client per invocation, call client.end() in finally block
 * - Long-running services: Create singleton client, manage connection lifecycle
 * - Testing: Use discrete parameters for test database connections
 */
export class DatabaseClient implements IDatabaseClient {
  private readonly pool: Pool;

  /**
   * Initialize database client with connection pooling.
   * Prefers connection string for production, supports discrete parameters for development.
   *
   * @param config - Database connection configuration
   */
  constructor(config?: DatabaseClientConfig) {
    const connectionString = config?.connectionString;
    this.pool = new Pool(
      connectionString
        ? {
            connectionString,
            ssl: config?.ssl ?? true,
            max: 10,
            idleTimeoutMillis: 30000, // Close idle connections after 30s
            connectionTimeoutMillis: 5000, // Timeout for acquiring connection
            allowExitOnIdle: true // Allow pool to close when Lambda container idles
          }
        : {
            host: config?.host,
            port: config?.port,
            database: config?.database,
            user: config?.user,
            password: config?.password,
            ssl: config?.ssl ?? true,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
            allowExitOnIdle: true
          }
    );
  }

  /**
   * Gracefully close all database connections in the pool.
   *
   * NOTE: When using getSharedDatabaseClient() in Lambda environments, do NOT call this method.
   * The shared client is reused across warm Lambda invocations, and the Lambda container
   * lifecycle will handle cleanup automatically.
   *
   * Only call this method when:
   * - Using DatabaseClient directly (not via getSharedDatabaseClient)
   * - Shutting down a long-running application
   * - Testing environments that need explicit cleanup
   */
  async end(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Simple health check to validate database connectivity.
   * Executes a lightweight `SELECT 1` query to verify the connection pool is functional.
   *
   * @returns Promise resolving to true if database is accessible, false otherwise
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.pool.query('SELECT 1');
      return result.rowCount === 1;
    } catch {
      return false;
    }
  }

  // ===== JOB MANAGEMENT OPERATIONS =====

  /**
   * Create a new invoice processing job with initial 'queued' status.
   * The job will be picked up by Step Functions for processing.
   *
   * @param params - Job creation parameters
   * @param params.clientId - Optional client identifier for API key attribution
   * @param params.pdfUrl - URL of the PDF to be processed
   * @returns Promise resolving to the newly created job
   */
  async createJob(params: { clientId: string | null; pdfUrl: string }): Promise<Job> {
    const query = `
      INSERT INTO jobs (client_id, pdf_url)
      VALUES ($1, $2)
      RETURNING id, client_id, status, processing_phase, pdf_url, created_at, updated_at, completed_at, error_message
    `;

    const result = await this.pool.query(query, [params.clientId, params.pdfUrl]);
    const row = result.rows[0];
    return this.mapJob(row);
  }

  async getJobById(id: string): Promise<Job | null> {
    const query = `
      SELECT id, client_id, status, processing_phase, pdf_url, created_at, updated_at, completed_at, error_message
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
      SELECT id, client_id, status, processing_phase, pdf_url, created_at, updated_at, completed_at, error_message
      FROM jobs
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    const result = await this.pool.query(query, values as any[]);
    return result.rows.map((r: any) => this.mapJob(r));
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
      RETURNING id, client_id, status, processing_phase, pdf_url, created_at, updated_at, completed_at, error_message
    `;
    const result = await this.pool.query(query, [id, status, errorMessage ?? null, completedAt ?? null]);
    if (result.rowCount === 0) return null;
    return this.mapJob(result.rows[0]);
  }

  // Mark a job as processing
  async setJobStatusProcessing(id: string): Promise<Job | null> {
    const query = `
      UPDATE jobs
      SET status = 'processing', error_message = NULL, completed_at = NULL
      WHERE id = $1
      RETURNING id, client_id, status, processing_phase, pdf_url, created_at, updated_at, completed_at, error_message
    `;
    const result = await this.pool.query(query, [id]);
    if (result.rowCount === 0) return null;
    return this.mapJob(result.rows[0]);
  }

  // Update processing phase
  async setJobProcessingPhase(id: string, phase: ProcessingPhase): Promise<Job | null> {
    const query = `
      UPDATE jobs
      SET processing_phase = $2
      WHERE id = $1
      RETURNING id, client_id, status, processing_phase, pdf_url, created_at, updated_at, completed_at, error_message
    `;
    const result = await this.pool.query(query, [id, phase]);
    if (result.rowCount === 0) return null;
    return this.mapJob(result.rows[0]);
  }

  // Clear processing phase (set to NULL)
  async clearJobProcessingPhase(id: string): Promise<Job | null> {
    const query = `
      UPDATE jobs
      SET processing_phase = NULL
      WHERE id = $1
      RETURNING id, client_id, status, processing_phase, pdf_url, created_at, updated_at, completed_at, error_message
    `;
    const result = await this.pool.query(query, [id]);
    if (result.rowCount === 0) return null;
    return this.mapJob(result.rows[0]);
  }

  // ===== JOB RESULTS OPERATIONS =====

  /**
   * Insert or update job result data using UPSERT pattern.
   * Supports partial updates from different processing steps (OCR → LLM).
   * Uses COALESCE to preserve existing data when new fields are null/undefined.
   *
   * Processing Flow:
   * 1. OCR step: Updates rawOcrText, ocrProvider, ocrDurationMs, ocrPages
   * 2. LLM step: Updates extractedData, confidenceScore, tokensUsed
   * 3. Each step can run independently without overwriting previous data
   *
   * @param params - Job result data (supports partial updates)
   * @returns Promise resolving to the complete job result
   */
  async upsertJobResult(params: {
    jobId: string;
    extractedData?: unknown | null;
    confidenceScore?: number | null;
    tokensUsed?: number | null;
    rawOcrText?: string | null;
    ocrProvider?: string | null;
    ocrDurationMs?: number | null;
    ocrPages?: number | null;
  }): Promise<JobResult> {
    const query = `
      INSERT INTO job_results (job_id, extracted_data, confidence_score, tokens_used, raw_ocr_text, ocr_provider, ocr_duration_ms, ocr_pages)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (job_id)
      DO UPDATE SET 
        extracted_data = COALESCE(EXCLUDED.extracted_data, job_results.extracted_data),
        confidence_score = COALESCE(EXCLUDED.confidence_score, job_results.confidence_score),
        tokens_used = COALESCE(EXCLUDED.tokens_used, job_results.tokens_used),
        raw_ocr_text = COALESCE(EXCLUDED.raw_ocr_text, job_results.raw_ocr_text),
        ocr_provider = COALESCE(EXCLUDED.ocr_provider, job_results.ocr_provider),
        ocr_duration_ms = COALESCE(EXCLUDED.ocr_duration_ms, job_results.ocr_duration_ms),
        ocr_pages = COALESCE(EXCLUDED.ocr_pages, job_results.ocr_pages)
      RETURNING id, job_id, extracted_data, confidence_score, tokens_used, raw_ocr_text, ocr_provider, ocr_duration_ms, ocr_pages, created_at
    `;
    const result = await this.pool.query(query, [
      params.jobId,
      params.extractedData === undefined ? null : JSON.stringify(params.extractedData),
      params.confidenceScore ?? null,
      params.tokensUsed ?? null,
      params.rawOcrText ?? null,
      params.ocrProvider ?? null,
      (typeof params.ocrDurationMs === 'number' && Number.isFinite(params.ocrDurationMs)
        ? Math.trunc(params.ocrDurationMs)
        : null),
      (typeof params.ocrPages === 'number' && Number.isFinite(params.ocrPages)
        ? Math.trunc(params.ocrPages)
        : null)
    ]);
    const row = result.rows[0];
    return this.mapJobResult(row);
  }

  async getJobResult(jobId: string): Promise<JobResult | null> {
    const query = `
      SELECT id, job_id, extracted_data, confidence_score, tokens_used, raw_ocr_text, ocr_provider, ocr_duration_ms, ocr_pages, created_at
      FROM job_results
      WHERE job_id = $1
    `;
    const result = await this.pool.query(query, [jobId]);
    if (result.rowCount === 0) return null;
    return this.mapJobResult(result.rows[0]);
  }

  // ===== PRIVATE MAPPING UTILITIES =====

  /**
   * Map PostgreSQL row data to typed Job interface.
   * Handles snake_case to camelCase conversion and proper type coercion.
   *
   * @param row - Raw database row from jobs table
   * @returns Typed Job object
   */
  private mapJob(row: any): Job {
    return {
      id: row.id,
      clientId: row.client_id,
      status: row.status,
      processingPhase: row.processing_phase ?? null,
      pdfUrl: row.pdf_url,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      errorMessage: row.error_message
    };
  }

  /**
   * Map PostgreSQL row data to typed JobResult interface.
   * Handles JSONB parsing, numeric coercion, and null safety.
   *
   * Special Handling:
   * - extractedData: JSONB field parsed from string or object
   * - Numeric fields: Safely converted with null preservation
   * - Optional fields: Proper null handling for database NULL values
   *
   * @param row - Raw database row from job_results table
   * @returns Typed JobResult object
   */
  private mapJobResult(row: any): JobResult {
    return {
      id: row.id,
      jobId: row.job_id,
      extractedData: row.extracted_data
        ? JSON.parse(typeof row.extracted_data === 'string' ? row.extracted_data : JSON.stringify(row.extracted_data))
        : null,
      confidenceScore: row.confidence_score !== null ? Number(row.confidence_score) : null,
      tokensUsed: row.tokens_used !== null ? Number(row.tokens_used) : null,
      rawOcrText: row.raw_ocr_text ?? null,
      ocrProvider: row.ocr_provider ?? null,
      ocrDurationMs: row.ocr_duration_ms !== null && row.ocr_duration_ms !== undefined ? Number(row.ocr_duration_ms) : null,
      ocrPages: row.ocr_pages !== null && row.ocr_pages !== undefined ? Number(row.ocr_pages) : null,
      createdAt: new Date(row.created_at)
    };
  }
}

/**
 * Utility function for managing database client lifecycle in Lambda functions.
 * Ensures proper connection cleanup even if the operation throws an error.
 *
 * Usage Pattern:
 * ```typescript
 * const result = await withDatabaseClient(config, async (client) => {
 *   const job = await client.createJob({ clientId: null, pdfUrl: 'https://...' });
 *   return job;
 * });
 * ```
 *
 * @param config - Database connection configuration
 * @param fn - Async function that receives the database client
 * @returns Promise resolving to the function result
 */
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

/**
 * Export shared database client utilities for Lambda connection pooling optimization
 */
export * from './shared-client';
