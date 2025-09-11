import { describe, it, expect } from 'vitest';
import { getApiInfo, API_VERSION } from './index';

describe('API Package', () => {
  describe('Constants', () => {
    it('should export correct API version', () => {
      expect(API_VERSION).toBe('1.0.0');
    });
  });

  describe('getApiInfo', () => {
    it('should return API info with correct structure', () => {
      const info = getApiInfo();

      expect(info).toEqual({
        name: 'cira-invoice-api',
        version: '1.0.0',
        status: 'healthy'
      });
    });

    it('should have correct types', () => {
      const info = getApiInfo();

      expect(typeof info.name).toBe('string');
      expect(typeof info.version).toBe('string');
      expect(['healthy', 'degraded', 'down']).toContain(info.status);
    });
  });
});
