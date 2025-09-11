// Step Functions package entry point
// This is a placeholder for the project setup story
// Actual workflow definitions will be added in subsequent stories

export const WORKFLOW_VERSION = '1.0.0';

export interface WorkflowInfo {
  name: string;
  version: string;
  type: string;
}

export function getWorkflowInfo(): WorkflowInfo {
  return {
    name: 'cira-invoice-workflow',
    version: WORKFLOW_VERSION,
    type: 'step-functions'
  };
}