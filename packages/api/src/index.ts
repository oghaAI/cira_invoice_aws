// API package entry point
// This is a placeholder for the project setup story
// Actual API implementation will be added in subsequent stories

export const API_VERSION = '1.0.0';

export interface ApiInfo {
  name: string;
  version: string;
  status: 'healthy' | 'degraded' | 'down';
}

export function getApiInfo(): ApiInfo {
  return {
    name: 'cira-invoice-api',
    version: API_VERSION,
    status: 'healthy'
  };
}