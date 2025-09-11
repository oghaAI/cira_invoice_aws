import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { readFileSync } from 'fs';
import path from 'path';

describe('Project Structure', () => {
  const projectRoot = __dirname;

  describe('Root Configuration Files', () => {
    it('should have package.json with correct configuration', () => {
      const packageJsonPath = path.join(projectRoot, 'package.json');
      expect(existsSync(packageJsonPath)).toBe(true);
      
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      expect(packageJson.name).toBe('cira-invoice-aws');
      expect(packageJson.private).toBe(true);
      expect(packageJson.workspaces).toContain('packages/*');
    });

    it('should have TypeScript configuration', () => {
      const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
      expect(existsSync(tsconfigPath)).toBe(true);
      
      const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));
      expect(tsconfig.compilerOptions.strict).toBe(true);
    });

    it('should have ESLint configuration', () => {
      const eslintPath = path.join(projectRoot, 'eslint.config.js');
      expect(existsSync(eslintPath)).toBe(true);
    });

    it('should have Prettier configuration', () => {
      const prettierPath = path.join(projectRoot, '.prettierrc');
      expect(existsSync(prettierPath)).toBe(true);
    });

    it('should have Vitest configuration', () => {
      const vitestPath = path.join(projectRoot, 'vitest.config.ts');
      expect(existsSync(vitestPath)).toBe(true);
    });
  });

  describe('Package Structure', () => {
    const packages = ['api', 'database', 'shared', 'infrastructure', 'step-functions'];
    
    packages.forEach(pkg => {
      describe(`Package: ${pkg}`, () => {
        const packagePath = path.join(projectRoot, 'packages', pkg);
        
        it(`should exist`, () => {
          expect(existsSync(packagePath)).toBe(true);
        });

        it(`should have package.json`, () => {
          const packageJsonPath = path.join(packagePath, 'package.json');
          expect(existsSync(packageJsonPath)).toBe(true);
          
          const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
          expect(packageJson.name).toBe(`@cira/${pkg}`);
        });

        it(`should have TypeScript configuration`, () => {
          const tsconfigPath = path.join(packagePath, 'tsconfig.json');
          expect(existsSync(tsconfigPath)).toBe(true);
        });

        it(`should have Vitest configuration`, () => {
          const vitestPath = path.join(packagePath, 'vitest.config.ts');
          expect(existsSync(vitestPath)).toBe(true);
        });
      });
    });
  });

  describe('Infrastructure Package', () => {
    const infraPath = path.join(projectRoot, 'packages', 'infrastructure');
    
    it('should have CDK configuration', () => {
      const cdkJsonPath = path.join(infraPath, 'cdk.json');
      expect(existsSync(cdkJsonPath)).toBe(true);
    });

    it('should have stack definitions', () => {
      const stacksPath = path.join(infraPath, 'src', 'stacks');
      expect(existsSync(stacksPath)).toBe(true);
      
      const stacks = ['api-stack.ts', 'database-stack.ts', 'workflow-stack.ts', 'monitoring-stack.ts'];
      stacks.forEach(stack => {
        expect(existsSync(path.join(stacksPath, stack))).toBe(true);
      });
    });

    it('should have configuration management', () => {
      const configPath = path.join(infraPath, 'src', 'config', 'index.ts');
      expect(existsSync(configPath)).toBe(true);
    });
  });

  describe('GitHub Actions', () => {
    const workflowsPath = path.join(projectRoot, '.github', 'workflows');
    
    it('should have workflows directory', () => {
      expect(existsSync(workflowsPath)).toBe(true);
    });

    it('should have test workflow', () => {
      const testWorkflow = path.join(workflowsPath, 'test.yml');
      expect(existsSync(testWorkflow)).toBe(true);
    });

    it('should have staging deployment workflow', () => {
      const stagingWorkflow = path.join(workflowsPath, 'deploy-staging.yml');
      expect(existsSync(stagingWorkflow)).toBe(true);
    });

    it('should have production deployment workflow', () => {
      const prodWorkflow = path.join(workflowsPath, 'deploy-production.yml');
      expect(existsSync(prodWorkflow)).toBe(true);
    });
  });

  describe('Scripts', () => {
    const scriptsPath = path.join(projectRoot, 'scripts');
    
    it('should have scripts directory', () => {
      expect(existsSync(scriptsPath)).toBe(true);
    });

    it('should have development setup script', () => {
      const setupScript = path.join(scriptsPath, 'setup-dev.sh');
      expect(existsSync(setupScript)).toBe(true);
    });

    it('should have test execution script', () => {
      const testScript = path.join(scriptsPath, 'run-tests.sh');
      expect(existsSync(testScript)).toBe(true);
    });
  });

  describe('Documentation', () => {
    it('should have README.md', () => {
      const readmePath = path.join(projectRoot, 'README.md');
      expect(existsSync(readmePath)).toBe(true);
      
      const readme = readFileSync(readmePath, 'utf-8');
      expect(readme).toContain('CIRA Invoice Processing System');
      expect(readme).toContain('Quick Start');
      expect(readme).toContain('Development Setup');
    });
  });
});