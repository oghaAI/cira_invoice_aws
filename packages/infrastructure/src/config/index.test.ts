import { describe, it, expect } from 'vitest';
import { getConfig } from './index';

describe('Infrastructure Configuration', () => {
  describe('getConfig', () => {
    it('should return development configuration', () => {
      const config = getConfig('dev');
      
      expect(config.environment).toBe('dev');
      expect(config.database.instanceClass).toBe('db.t3.micro');
      expect(config.database.multiAz).toBe(false);
      expect(config.database.deletionProtection).toBe(false);
      expect(config.api.memorySize).toBe(512);
      expect(config.monitoring.createDashboard).toBe(true);
    });

    it('should return staging configuration', () => {
      const config = getConfig('staging');
      
      expect(config.environment).toBe('staging');
      expect(config.database.instanceClass).toBe('db.t3.small');
      expect(config.database.multiAz).toBe(false);
      expect(config.database.deletionProtection).toBe(true);
      expect(config.api.memorySize).toBe(1024);
      expect(config.api.reservedConcurrency).toBe(50);
    });

    it('should return production configuration', () => {
      const config = getConfig('prod');
      
      expect(config.environment).toBe('prod');
      expect(config.database.instanceClass).toBe('db.r5.large');
      expect(config.database.multiAz).toBe(true);
      expect(config.database.deletionProtection).toBe(true);
      expect(config.api.memorySize).toBe(2048);
      expect(config.api.reservedConcurrency).toBe(100);
    });

    it('should throw error for unknown environment', () => {
      expect(() => {
        getConfig('unknown' as any);
      }).toThrow('Unknown environment: unknown');
    });

    it('should have consistent structure across environments', () => {
      const environments = ['dev', 'staging', 'prod'];
      
      environments.forEach(env => {
        const config = getConfig(env);
        
        // Ensure all required properties exist
        expect(config).toHaveProperty('environment');
        expect(config).toHaveProperty('database');
        expect(config).toHaveProperty('api');
        expect(config).toHaveProperty('stepFunctions');
        expect(config).toHaveProperty('monitoring');
        
        // Ensure database config is complete
        expect(config.database).toHaveProperty('instanceClass');
        expect(config.database).toHaveProperty('allocatedStorage');
        expect(config.database).toHaveProperty('multiAz');
        expect(config.database).toHaveProperty('backupRetentionDays');
        expect(config.database).toHaveProperty('deletionProtection');
        
        // Ensure API config is complete
        expect(config.api).toHaveProperty('memorySize');
        expect(config.api).toHaveProperty('timeout');
        expect(config.api).toHaveProperty('logRetentionDays');
      });
    });

    it('should have appropriate values for production', () => {
      const prodConfig = getConfig('prod');
      
      // Production should have higher resources
      expect(prodConfig.database.allocatedStorage).toBeGreaterThan(50);
      expect(prodConfig.api.memorySize).toBeGreaterThan(1024);
      expect(prodConfig.database.backupRetentionDays).toBeGreaterThan(14);
      
      // Production should have protection enabled
      expect(prodConfig.database.deletionProtection).toBe(true);
      expect(prodConfig.database.multiAz).toBe(true);
    });
  });
});