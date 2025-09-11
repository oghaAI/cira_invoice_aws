import { describe, it, expect } from 'vitest';
import { getWorkflowInfo, WORKFLOW_VERSION } from './index';

describe('Step Functions Package', () => {
  describe('Constants', () => {
    it('should export correct step functions version', () => {
      expect(WORKFLOW_VERSION).toBe('1.0.0');
    });
  });

  describe('getWorkflowInfo', () => {
    it('should return step functions info with correct structure', () => {
      const info = getWorkflowInfo();

      expect(info).toEqual({
        name: 'cira-invoice-workflow',
        version: '1.0.0',
        type: 'step-functions'
      });
    });

    it('should have correct types', () => {
      const info = getWorkflowInfo();

      expect(typeof info.name).toBe('string');
      expect(typeof info.version).toBe('string');
      expect(typeof info.type).toBe('string');
    });
  });
});
