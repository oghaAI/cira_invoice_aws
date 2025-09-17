/**
 * CIRA Invoice Processing System - Job Repository
 *
 * Repository pattern implementation for Job entity operations.
 * Provides a higher-level, domain-focused interface over the raw DatabaseClient,
 * encapsulating common job management patterns and business logic.
 *
 * Architecture Pattern:
 * - Repository pattern for domain-driven design
 * - Delegates to DatabaseClient for actual database operations
 * - Provides simplified method signatures for common use cases
 * - Can be extended with business logic without affecting database layer
 *
 * Usage Scenarios:
 * - API handlers for job management operations
 * - Step Functions integration for status updates
 * - Background services for job queue processing
 * - Administrative tools for job monitoring
 *
 * @see packages/database/src/index.ts - Underlying database operations
 * @see packages/database/src/models/job.ts - Job entity definition
 */

import { DatabaseClient } from '..';
import { Job, JobStatus } from '../models/job';

/**
 * Repository for Job entity operations with business-focused method signatures.
 * Wraps DatabaseClient to provide domain-specific operations and potential
 * business logic layer for job management.
 *
 * Design Benefits:
 * - Simplified method signatures for common operations
 * - Abstraction layer for potential business logic injection
 * - Consistent error handling patterns
 * - Easy mocking for unit tests
 */
export class JobRepository {
  constructor(private readonly db: DatabaseClient) {}

  /**
   * Create a new invoice processing job with initial 'queued' status.
   *
   * @param clientId - Optional client identifier for attribution
   * @param pdfUrl - Source PDF URL to be processed
   * @returns Promise resolving to the newly created job
   */
  create(clientId: string | null, pdfUrl: string): Promise<Job> {
    return this.db.createJob({ clientId, pdfUrl });
  }

  /**
   * Retrieve a job by its unique identifier.
   *
   * @param id - Job UUID
   * @returns Promise resolving to job or null if not found
   */
  findById(id: string): Promise<Job | null> {
    return this.db.getJobById(id);
  }

  /**
   * List jobs for a specific client with optional filtering and pagination.
   *
   * @param clientId - Client identifier to filter by
   * @param limit - Maximum number of jobs to return (default: 50)
   * @param status - Optional status filter
   * @returns Promise resolving to array of jobs (newest first)
   */
  listByClient(clientId: string, limit = 50, status?: JobStatus): Promise<Job[]> {
    const opts: { limit?: number; status?: JobStatus } = { limit };
    if (status !== undefined) {
      opts.status = status;
    }
    return this.db.listJobsByClient(clientId, opts);
  }

  /**
   * Update job status with optional error details and completion timestamp.
   * Commonly used by Step Functions for status transitions.
   *
   * @param id - Job UUID
   * @param status - New job status
   * @param errorMessage - Error details if status is 'failed'
   * @param completedAt - Completion timestamp for final states
   * @returns Promise resolving to updated job or null if not found
   */
  updateStatus(
    id: string,
    status: JobStatus,
    errorMessage?: string | null,
    completedAt?: Date | null
  ): Promise<Job | null> {
    return this.db.updateJobStatus(id, status, errorMessage, completedAt);
  }
}
