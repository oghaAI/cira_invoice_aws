/**
 * CIRA Invoice Processing System - Job Result Repository
 *
 * Repository pattern implementation for JobResult entity operations.
 * Provides a domain-focused interface for managing processing results,
 * including both OCR outputs and LLM-extracted structured data.
 *
 * Key Responsibilities:
 * - Simplified interface for job result UPSERT operations
 * - Abstraction over complex database UPSERT logic
 * - Support for incremental updates from different processing steps
 * - Potential business logic layer for result validation and enrichment
 *
 * Processing Integration:
 * - OCR step: Updates raw text, provider metadata, and performance metrics
 * - LLM step: Updates structured data, confidence scores, and token usage
 * - Both steps can operate independently via UPSERT pattern
 *
 * @see packages/database/src/index.ts - Underlying database operations
 * @see packages/database/src/models/jobResult.ts - JobResult entity definition
 * @see docs/stories/3.2.invoice-schema-zod.md - Structured data schema
 */

import { DatabaseClient } from '..';
import { JobResult } from '../models/jobResult';

/**
 * Repository for JobResult entity operations with domain-specific method signatures.
 * Encapsulates the complexity of UPSERT operations and provides simplified
 * interfaces for the most common result management patterns.
 *
 * Design Benefits:
 * - Simplified method signatures hiding database complexity
 * - Type-safe operations with proper null handling
 * - Consistent UPSERT behavior across different processing steps
 * - Easy mocking for unit tests and development
 */
export class JobResultRepository {
  constructor(private readonly db: DatabaseClient) {}

  /**
   * Insert or update job result data (simplified interface for LLM processing).
   * Primarily used by LLM extraction step to store structured invoice data.
   *
   * UPSERT Behavior:
   * - Creates new record if none exists for the jobId
   * - Updates existing record preserving any existing OCR metadata
   * - Uses COALESCE to avoid overwriting with null values
   *
   * @param jobId - Reference to parent job
   * @param extractedData - Zod-validated invoice structure from LLM
   * @param confidenceScore - Overall extraction confidence (0.0-1.0)
   * @param tokensUsed - LLM token consumption for cost tracking
   * @returns Promise resolving to complete job result
   */
  upsert(
    jobId: string,
    extractedData: unknown,
    confidenceScore: number | null,
    tokensUsed: number | null
  ): Promise<JobResult> {
    return this.db.upsertJobResult({ jobId, extractedData, confidenceScore, tokensUsed });
  }

  /**
   * Retrieve job result by job identifier.
   * Returns complete result including both OCR and LLM data.
   *
   * @param jobId - Job UUID to look up results for
   * @returns Promise resolving to job result or null if not found
   */
  findByJobId(jobId: string): Promise<JobResult | null> {
    return this.db.getJobResult(jobId);
  }
}
