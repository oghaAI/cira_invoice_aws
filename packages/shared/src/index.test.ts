import { describe, it, expect } from 'vitest';
import { getProjectInfo, PROJECT_NAME, VERSION } from './index';

describe('Shared Package', () => {
  describe('Constants', () => {
    it('should export correct project name', () => {
      expect(PROJECT_NAME).toBe('cira-invoice-aws');
    });

    it('should export correct version', () => {
      expect(VERSION).toBe('1.0.0');
    });
  });

  describe('getProjectInfo', () => {
    it('should return project info with default environment', () => {
      const result = getProjectInfo();
      
      expect(result).toEqual({
        name: 'cira-invoice-aws',
        version: '1.0.0',
        environment: 'dev'
      });
    });

    it('should return project info with specified environment', () => {
      const result = getProjectInfo('prod');
      
      expect(result).toEqual({
        name: 'cira-invoice-aws',
        version: '1.0.0',
        environment: 'prod'
      });
    });

    it('should handle all valid environments', () => {
      const environments: Array<'dev' | 'staging' | 'prod'> = ['dev', 'staging', 'prod'];
      
      environments.forEach(env => {
        const result = getProjectInfo(env);
        expect(result.environment).toBe(env);
        expect(result.name).toBe(PROJECT_NAME);
        expect(result.version).toBe(VERSION);
      });
    });
  });
});