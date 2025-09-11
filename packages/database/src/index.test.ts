import { describe, it, expect } from 'vitest';
import { getDatabaseInfo, DATABASE_VERSION } from './index';

describe('Database Package', () => {
  describe('Constants', () => {
    it('should export correct database version', () => {
      expect(DATABASE_VERSION).toBe('1.0.0');
    });
  });

  describe('getDatabaseInfo', () => {
    it('should return database info with correct structure', () => {
      const info = getDatabaseInfo();

      expect(info).toEqual({
        name: 'cira-invoice-db',
        version: '1.0.0',
        type: 'postgresql'
      });
    });

    it('should have correct types', () => {
      const info = getDatabaseInfo();

      expect(typeof info.name).toBe('string');
      expect(typeof info.version).toBe('string');
      expect(typeof info.type).toBe('string');
    });
  });
});
