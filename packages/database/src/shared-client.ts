/**
 * Singleton database client for Lambda function reuse.
 * Maintains a single connection pool across Lambda warm starts.
 *
 * This module prevents connection pool exhaustion by:
 * - Reusing the same DatabaseClient instance across Lambda invocations
 * - Leveraging Lambda container warm starts for connection pooling
 * - Reducing overhead of creating/destroying pools per invocation
 */

import { DatabaseClient, DatabaseClientConfig } from './index';

/**
 * Cached singleton DatabaseClient instance
 */
let cachedClient: DatabaseClient | null = null;

/**
 * Hash of the cached client's configuration for change detection
 */
let cachedConfig: string | null = null;

/**
 * Get or create a singleton DatabaseClient instance.
 *
 * This function implements the singleton pattern for database connections
 * in Lambda environments. It:
 * - Returns the cached client if configuration hasn't changed
 * - Creates a new client if this is the first call or config changed
 * - Gracefully closes old clients when configuration changes
 *
 * IMPORTANT: Do not call db.end() on the returned client in handler code.
 * Let the Lambda container lifecycle manage cleanup when the container is recycled.
 *
 * @param config - Database configuration
 * @returns Shared DatabaseClient instance
 *
 * @example
 * ```typescript
 * // In Lambda handler
 * const db = getSharedDatabaseClient({
 *   connectionString: process.env.DATABASE_URL
 * });
 *
 * // Use the client
 * const result = await db.query(...);
 *
 * // DO NOT call db.end() - let Lambda manage lifecycle
 * ```
 */
export function getSharedDatabaseClient(config: DatabaseClientConfig): DatabaseClient {
  // Create a stable config hash for comparison
  // Exclude password from hash for security (it's in connectionString)
  const configHash = JSON.stringify({
    connectionString: config.connectionString,
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
  });

  // Return cached client if config hasn't changed
  if (cachedClient && cachedConfig === configHash) {
    return cachedClient;
  }

  // Close old client if config changed
  if (cachedClient) {
    // Don't await - let it close in background
    cachedClient.end().catch((err) => {
      console.error('Error closing old database client during config change:', err);
    });
  }

  // Create new client and cache it
  cachedClient = new DatabaseClient(config);
  cachedConfig = configHash;

  return cachedClient;
}

/**
 * Manually clear the cached client.
 *
 * This is primarily useful for testing. In production Lambda environments,
 * you should let the Lambda container lifecycle manage cleanup.
 *
 * @example
 * ```typescript
 * // In tests
 * afterEach(() => {
 *   clearCachedClient();
 * });
 * ```
 */
export function clearCachedClient(): void {
  if (cachedClient) {
    cachedClient.end().catch((err) => {
      console.error('Error clearing cached database client:', err);
    });
    cachedClient = null;
    cachedConfig = null;
  }
}
