import { App, Stack } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { describe, it, expect } from 'vitest';
import { DatabaseStack } from './database-stack';
import { EnvironmentConfig } from '../config';

describe('DatabaseStack', () => {
  const mockConfig: EnvironmentConfig = {
    envName: 'test',
    region: 'us-east-1',
    account: '123456789012'
  };

  it('should create RDS PostgreSQL instance with auto-scaling storage', () => {
    const app = new App();
    const stack = new DatabaseStack(app, 'TestDatabaseStack', {
      config: mockConfig
    });

    const template = Template.fromStack(stack);

    // Verify RDS instance is created
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      Engine: 'postgres',
      EngineVersion: '16.4',
      DBInstanceClass: 'db.t3.micro',
      AllocatedStorage: '20',
      StorageType: 'gp3',
      StorageEncrypted: true,
      DatabaseName: 'cira_invoice',
    });

    // Verify auto-scaling storage is enabled
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      MaxAllocatedStorage: 1000
    });
  });

  it('should create RDS Proxy for connection pooling', () => {
    const app = new App();
    const stack = new DatabaseStack(app, 'TestDatabaseStack', {
      config: mockConfig
    });

    const template = Template.fromStack(stack);

    // Verify RDS Proxy is created
    template.hasResourceProperties('AWS::RDS::DBProxy', {
      EngineFamily: 'POSTGRESQL',
      RequireTLS: true,
      MaxConnectionsPercent: 100,
      MaxIdleConnectionsPercent: 50,
      IdleClientTimeout: 1800 // 30 minutes in seconds
    });
  });

  it('should create VPC with correct subnet configuration', () => {
    const app = new App();
    const stack = new DatabaseStack(app, 'TestDatabaseStack', {
      config: mockConfig
    });

    const template = Template.fromStack(stack);

    // Verify VPC is created
    template.hasResourceProperties('AWS::EC2::VPC', {
      CidrBlock: '10.0.0.0/16'
    });

    // Verify subnets are created (should have public, private, and isolated)
    template.resourceCountIs('AWS::EC2::Subnet', 6); // 2 AZs x 3 subnet types
  });

  it('should create security group with PostgreSQL port access', () => {
    const app = new App();
    const stack = new DatabaseStack(app, 'TestDatabaseStack', {
      config: mockConfig
    });

    const template = Template.fromStack(stack);

    // Verify security group is created with PostgreSQL port
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      SecurityGroupIngress: [
        {
          IpProtocol: 'tcp',
          FromPort: 5432,
          ToPort: 5432,
          CidrIp: '10.0.0.0/16'
        }
      ]
    });
  });

  it('should have proper outputs', () => {
    const app = new App();
    const stack = new DatabaseStack(app, 'TestDatabaseStack', {
      config: mockConfig
    });

    const template = Template.fromStack(stack);

    // Verify outputs exist
    template.hasOutput('DatabaseEndpoint', {});
    template.hasOutput('DatabaseProxyEndpoint', {});
    template.hasOutput('DatabaseSecretArn', {});
    template.hasOutput('VpcId', {});
    template.hasOutput('DatabaseSecurityGroupId', {});
  });

  it('should configure production settings for production environment', () => {
    const prodConfig: EnvironmentConfig = {
      envName: 'production',
      region: 'us-east-1',
      account: '123456789012'
    };

    const app = new App();
    const stack = new DatabaseStack(app, 'TestDatabaseStack', {
      config: prodConfig
    });

    const template = Template.fromStack(stack);

    // Verify production-specific settings
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      MultiAZ: true,
      DeletionProtection: true
    });
  });
});
