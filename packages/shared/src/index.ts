// Shared package entry point
export const PROJECT_NAME = 'cira-invoice-aws';
export const VERSION = '1.0.0';

export interface ProjectInfo {
  name: string;
  version: string;
  environment: 'dev' | 'staging' | 'prod';
}

export function getProjectInfo(environment: 'dev' | 'staging' | 'prod' = 'dev'): ProjectInfo {
  return {
    name: PROJECT_NAME,
    version: VERSION,
    environment
  };
}