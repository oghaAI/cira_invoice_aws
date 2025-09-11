// Database package entry point
// This is a placeholder for the project setup story
// Actual database schema and queries will be added in subsequent stories

export const DATABASE_VERSION = '1.0.0';

export interface DatabaseInfo {
  name: string;
  version: string;
  type: string;
}

export function getDatabaseInfo(): DatabaseInfo {
  return {
    name: 'cira-invoice-db',
    version: DATABASE_VERSION,
    type: 'postgresql'
  };
}