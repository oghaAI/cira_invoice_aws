/**
 * CIRA Invoice Processing System - Database Infrastructure Stack
 *
 * This stack creates the foundational data layer for the invoice processing system:
 * - PostgreSQL 16.4 RDS instance with auto-scaling storage (20GB → 1TB)
 * - VPC with public, private, and isolated subnets across 2 AZs
 * - RDS Proxy for connection pooling and improved performance
 * - Security groups with least-privilege access controls
 * - VPC endpoints for AWS services access from isolated subnets
 *
 * Architecture Compliance:
 * - Single PostgreSQL database for all data storage (no caching layer)
 * - GP3 storage with encryption at rest
 * - Multi-AZ deployment in production for 99.9% availability
 * - Connection pooling to handle high concurrent load
 *
 * Security Features:
 * - Database in isolated subnets (no internet access)
 * - Secrets Manager for credential management
 * - VPC endpoints for secure AWS service communication
 * - Least-privilege security group rules
 *
 * Based on: docs/architecture-mvp.md, docs/stories/1.2.scalable-aws-infrastructure.md
 */
import * as cdk from 'aws-cdk-lib';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';

export interface DatabaseStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
}

export class DatabaseStack extends cdk.Stack {
  /** PostgreSQL RDS database instance */
  public readonly database: rds.DatabaseInstance;

  /** RDS Proxy for connection pooling and Lambda integration */
  public readonly databaseProxy: rds.DatabaseProxy;

  /** VPC with multi-AZ subnets for network isolation */
  public readonly vpc: ec2.Vpc;

  /** Security group for database access control */
  public readonly securityGroup: ec2.SecurityGroup;

  /** Security group for VPC endpoint access */
  public readonly vpcEndpointSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    // ========================================================================
    // VPC INFRASTRUCTURE
    // ========================================================================

    // Create multi-tier VPC with proper subnet isolation for security and cost optimization
    this.vpc = new ec2.Vpc(this, 'CiraVpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),  // 65,536 IP addresses
      maxAzs: 2,                                          // Multi-AZ for high availability
      natGateways: 1,                                     // Single NAT for cost optimization (dev/staging)
      subnetConfiguration: [
        {
          cidrMask: 24,                                   // 256 IP addresses per subnet
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC               // For NAT Gateway and Load Balancers
        },
        {
          cidrMask: 24,                                   // 256 IP addresses per subnet
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS  // For Lambda functions (need internet access)
        },
        {
          cidrMask: 24,                                   // 256 IP addresses per subnet
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED     // For RDS (no internet access)
        }
      ]
    });

    // ========================================================================
    // SECURITY GROUPS
    // ========================================================================

    // Primary security group for RDS instance and RDS Proxy
    // Implements least-privilege access with no outbound internet access
    this.securityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc: this.vpc as unknown as ec2.IVpc,
      description: 'Security group for PostgreSQL RDS instance and RDS Proxy',
      allowAllOutbound: false                              // Explicit outbound rules only
    });

    // Allow PostgreSQL traffic from Lambda functions within the VPC
    // This rule permits access from all VPC resources to the database
    // Lambda functions will be placed in the same security group for simplicity
    this.securityGroup.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),               // Allow from entire VPC CIDR
      ec2.Port.tcp(5432),                                 // PostgreSQL default port
      'Allow PostgreSQL access from VPC resources'
    );

    // Allow outbound PostgreSQL traffic within the same security group
    // This enables RDS Proxy to communicate with the RDS instance
    this.securityGroup.addEgressRule(
      this.securityGroup,                                 // Self-referencing rule
      ec2.Port.tcp(5432),
      'Allow RDS Proxy to communicate with RDS instance'
    );

    // ========================================================================
    // POSTGRESQL RDS DATABASE
    // ========================================================================

    // PostgreSQL 16.4 RDS instance with auto-scaling storage for invoice processing
    // Configured for high availability in production and cost optimization in development
    this.database = new rds.DatabaseInstance(this, 'PostgreSQLDatabase', {
      // Database engine configuration
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_4        // Latest stable PostgreSQL version
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),  // Will be overridden by config

      // Credential management via AWS Secrets Manager
      credentials: rds.Credentials.fromGeneratedSecret('postgres', {
        secretName: `${props.config.environment}/rds/credentials`  // Environment-specific secret
      }),

      // Network configuration - isolated subnet for security
      vpc: this.vpc as unknown as ec2.IVpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED        // No internet access for maximum security
      },
      securityGroups: [this.securityGroup],

      // Storage configuration with auto-scaling
      allocatedStorage: 20,                               // Initial storage allocation (GB)
      maxAllocatedStorage: 1000,                          // Auto-scale up to 1TB per requirements
      storageType: rds.StorageType.GP3,                   // General Purpose SSD v3 for best price/performance
      storageEncrypted: true,                             // Encryption at rest for security compliance

      // High availability and disaster recovery
      multiAz: props.config.environment === 'prod',       // Multi-AZ only in production for 99.9% availability
      deletionProtection: props.config.environment === 'prod',  // Prevent accidental deletion in production
      backupRetention: cdk.Duration.days(7),              // 7-day backup retention (minimum for RDS)
      deleteAutomatedBackups: props.config.environment !== 'prod',  // Keep backups only in production

      // Database configuration
      databaseName: 'cira_invoice',                       // Default database name for application
      removalPolicy: props.config.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY
    });

    // ========================================================================
    // VPC ENDPOINTS FOR AWS SERVICES ACCESS
    // ========================================================================

    // Security group for VPC interface endpoints
    // Allows Lambda functions in isolated subnets to access AWS services
    this.vpcEndpointSecurityGroup = new ec2.SecurityGroup(this, 'VpcEndpointSecurityGroup', {
      vpc: this.vpc as unknown as ec2.IVpc,
      description: 'Security group for VPC interface endpoints (Secrets Manager, Step Functions)',
      allowAllOutbound: true                              // Allow outbound to AWS services
    });

    // Allow HTTPS traffic from VPC resources to VPC endpoints
    this.vpcEndpointSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),               // Allow from entire VPC
      ec2.Port.tcp(443),                                  // HTTPS port
      'Allow HTTPS from VPC resources to AWS service endpoints'
    );

    // VPC Endpoint for Secrets Manager
    // Enables Lambda functions to retrieve database credentials without internet access
    new ec2.InterfaceVpcEndpoint(this, 'SecretsManagerEndpoint', {
      vpc: this.vpc as unknown as ec2.IVpc,
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },  // Same subnet as RDS
      securityGroups: [this.vpcEndpointSecurityGroup]
    });

    // VPC Endpoint for Step Functions
    // Enables Lambda functions to start Step Functions executions without internet access
    new ec2.InterfaceVpcEndpoint(this, 'StepFunctionsEndpoint', {
      vpc: this.vpc as unknown as ec2.IVpc,
      service: ec2.InterfaceVpcEndpointAwsService.STEP_FUNCTIONS,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },  // Same subnet as RDS
      securityGroups: [this.vpcEndpointSecurityGroup]
    });

    // ========================================================================
    // RDS PROXY FOR CONNECTION POOLING
    // ========================================================================

    // RDS Proxy provides connection pooling and improves Lambda performance
    // Prevents connection exhaustion under high concurrent load (3K daily jobs)
    this.databaseProxy = new rds.DatabaseProxy(this, 'DatabaseProxy', {
      proxyTarget: rds.ProxyTarget.fromInstance(this.database),  // Target our RDS instance
      secrets: [this.database.secret!],                         // Use same credentials as RDS

      // Network configuration - same isolated subnets as RDS
      vpc: this.vpc as unknown as ec2.IVpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED             // No internet access
      },
      securityGroups: [this.securityGroup],                     // Same security group as RDS

      // Security and performance configuration
      requireTLS: true,                                         // Force TLS encryption for all connections
      maxConnectionsPercent: 100,                               // Use 100% of RDS max connections
      maxIdleConnectionsPercent: 50,                            // Keep 50% connections idle for quick access
      idleClientTimeout: cdk.Duration.minutes(30)               // Close idle connections after 30 minutes
    });

    // ========================================================================
    // CLOUDFORMATION OUTPUTS
    // ========================================================================
    // These outputs are used by other stacks for cross-stack references

    // RDS instance direct endpoint (not typically used, prefer proxy)
    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: this.database.instanceEndpoint.hostname,
      description: 'Direct RDS PostgreSQL endpoint (use proxy endpoint instead for Lambda)'
    });

    // RDS Proxy endpoint - PRIMARY connection point for Lambda functions
    new cdk.CfnOutput(this, 'DatabaseProxyEndpoint', {
      value: this.databaseProxy.endpoint,
      description: 'RDS Proxy endpoint for connection pooling (primary DB access point)'
    });

    // Database credentials secret ARN for Lambda environment variables
    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: this.database.secret!.secretArn,
      description: 'AWS Secrets Manager ARN containing database credentials'
    });

    // VPC ID for Lambda function deployment in API stack
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID for Lambda function placement and networking'
    });

    // Security group ID for Lambda functions to access database
    new cdk.CfnOutput(this, 'DatabaseSecurityGroupId', {
      value: this.securityGroup.securityGroupId,
      description: 'Security group ID for database access (assign to Lambda functions)'
    });
  }
}
