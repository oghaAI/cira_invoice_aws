/**
 * @fileoverview CIRA Invoice Processing System - API Package Entry Point
 *
 * This module serves as the main entry point for the CIRA Invoice Processing API package.
 * The system implements a serverless architecture using AWS Lambda, Step Functions, and RDS
 * to process PDF invoices through a 3-stage workflow: OCR → LLM Extraction → Storage.
 *
 * Architecture Overview:
 * - Serverless-first design with AWS Lambda functions for scalability
 * - Step Functions orchestrate the invoice processing workflow
 * - PostgreSQL database for persistent storage of jobs and results
 * - External integrations: Docling (OCR), Azure OpenAI (LLM extraction)
 *
 * Key Features:
 * - RESTful API for job management and status tracking
 * - Structured data extraction with Zod schema validation
 * - Type-safe database operations using Drizzle ORM
 * - Comprehensive error handling and logging
 * - Security through API key authentication
 *
 * @version 1.0.0
 * @author CIRA Development Team
 * @since 2025-09-15
 */

/**
 * Current API version following semantic versioning.
 * Used for health checks and API compatibility verification.
 */
export const API_VERSION = '1.0.0';

/**
 * Interface defining the structure of API health information.
 * Used by health check endpoints to report system status.
 */
export interface ApiInfo {
  /** The service name identifier */
  name: string;
  /** Current API version */
  version: string;
  /** Overall system health status */
  status: 'healthy' | 'degraded' | 'down';
}

/**
 * Returns basic API information for health checks and service discovery.
 * This function provides a lightweight way to verify the API is running
 * and report its current version and health status.
 *
 * @returns {ApiInfo} Object containing service name, version, and health status
 *
 * @example
 * ```typescript
 * const info = getApiInfo();
 * console.log(`${info.name} v${info.version} is ${info.status}`);
 * // Output: "cira-invoice-api v1.0.0 is healthy"
 * ```
 */
export function getApiInfo(): ApiInfo {
  return {
    name: 'cira-invoice-api',
    version: API_VERSION,
    status: 'healthy'
  };
}