import * as cdk from 'aws-cdk-lib';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';

export interface DatabaseStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
}

export class DatabaseStack extends cdk.Stack {
  public readonly database: rds.DatabaseInstance;
  public readonly databaseProxy: rds.DatabaseProxy;
  public readonly vpc: ec2.Vpc;
  public readonly securityGroup: ec2.SecurityGroup;
  public readonly vpcEndpointSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    // Create VPC for RDS instance
    this.vpc = new ec2.Vpc(this, 'CiraVpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
        },
        {
          cidrMask: 24,
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED
        }
      ]
    });

    // Create security group for RDS
    this.securityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc: this.vpc as unknown as ec2.IVpc,
      description: 'Security group for PostgreSQL RDS instance',
      allowAllOutbound: false
    });

    // Allow PostgreSQL traffic from Lambda functions (will be refined when Lambda SG is created)
    this.securityGroup.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access from VPC'
    );

    // Allow outbound Postgres traffic within the same security group (for RDS Proxy -> DB)
    this.securityGroup.addEgressRule(
      this.securityGroup,
      ec2.Port.tcp(5432),
      'Allow outbound PostgreSQL to resources in same SG'
    );

    // Create RDS PostgreSQL instance with auto-scaling storage
    this.database = new rds.DatabaseInstance(this, 'PostgreSQLDatabase', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_4
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      credentials: rds.Credentials.fromGeneratedSecret('postgres', {
        secretName: `${props.config.environment}/rds/credentials`
      }),
      vpc: this.vpc as unknown as ec2.IVpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED
      },
      securityGroups: [this.securityGroup],
      allocatedStorage: 20,
      maxAllocatedStorage: 1000, // 1TB max as per requirements - enables auto-scaling
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      multiAz: props.config.environment === 'prod',
      deletionProtection: props.config.environment === 'prod',
      backupRetention: cdk.Duration.days(7),
      deleteAutomatedBackups: props.config.environment !== 'prod',
      databaseName: 'cira_invoice',
      removalPolicy: props.config.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY
    });

    // VPC Interface Endpoint for Secrets Manager to allow access from isolated subnets
    this.vpcEndpointSecurityGroup = new ec2.SecurityGroup(this, 'VpcEndpointSecurityGroup', {
      vpc: this.vpc as unknown as ec2.IVpc,
      description: 'Security group for VPC interface endpoints',
      allowAllOutbound: true
    });
    // Allow inbound from inside the VPC to the endpoint ENIs
    this.vpcEndpointSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(443),
      'Allow HTTPS from VPC to interface endpoints'
    );

    new ec2.InterfaceVpcEndpoint(this, 'SecretsManagerEndpoint', {
      vpc: this.vpc as unknown as ec2.IVpc,
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [this.vpcEndpointSecurityGroup]
    });

    // Create RDS Proxy for connection pooling
    this.databaseProxy = new rds.DatabaseProxy(this, 'DatabaseProxy', {
      proxyTarget: rds.ProxyTarget.fromInstance(this.database),
      secrets: [this.database.secret!],
      vpc: this.vpc as unknown as ec2.IVpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED
      },
      securityGroups: [this.securityGroup],
      requireTLS: true,
      maxConnectionsPercent: 100,
      maxIdleConnectionsPercent: 50,
      idleClientTimeout: cdk.Duration.minutes(30)
    });

    // Outputs
    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: this.database.instanceEndpoint.hostname,
      description: 'RDS PostgreSQL endpoint'
    });

    new cdk.CfnOutput(this, 'DatabaseProxyEndpoint', {
      value: this.databaseProxy.endpoint,
      description: 'RDS Proxy endpoint for connection pooling'
    });

    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: this.database.secret!.secretArn,
      description: 'ARN of the database credentials secret'
    });

    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID for Lambda functions'
    });

    new cdk.CfnOutput(this, 'DatabaseSecurityGroupId', {
      value: this.securityGroup.securityGroupId,
      description: 'Security group ID for database access'
    });
  }
}
