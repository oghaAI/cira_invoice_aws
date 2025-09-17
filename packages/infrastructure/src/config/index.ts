/**
 * Environment Configuration Interface
 *
 * Defines the configuration schema for different deployment environments (dev, staging, prod).
 * This interface ensures type safety and consistency across all infrastructure stacks.
 *
 * Based on architecture requirements from docs/architecture-mvp.md:
 * - Support for 3,000 invoices/day (90,000/month) in production
 * - 99.9% uptime requirement
 * - Auto-scaling capabilities
 * - Environment-specific resource allocation
 */
export interface EnvironmentConfig {
  /** Environment name (dev, staging, prod) */
  environment: string;

  /** PostgreSQL RDS configuration */
  database: {
    /** RDS instance class (e.g., db.t3.micro for dev, db.r5.large for prod) */
    instanceClass: string;
    /** Initial allocated storage in GB */
    allocatedStorage: number;
    /** Enable Multi-AZ deployment for high availability */
    multiAz: boolean;
    /** Backup retention period in days */
    backupRetentionDays: number;
    /** Enable deletion protection to prevent accidental deletion */
    deletionProtection: boolean;
  };

  /** Lambda function configuration for API endpoints */
  api: {
    /** Reserved concurrency to prevent cold starts (optional for dev) */
    reservedConcurrency?: number;
    /** Memory allocation in MB */
    memorySize: number;
    /** Function timeout in seconds */
    timeout: number;
    /** CloudWatch log retention in days */
    logRetentionDays: number;
  };

  /** Step Functions workflow configuration */
  stepFunctions: {
    /** Maximum workflow execution time in seconds */
    timeout: number;
    /** Logging level (ALL for dev, ERROR for prod) */
    logLevel: string;
  };

  /** CloudWatch monitoring and alerting configuration */
  monitoring: {
    /** Email address for alarm notifications (production only) */
    alertEmail?: string;
    /** Whether to create CloudWatch dashboard */
    createDashboard: boolean;
    /** Enable detailed monitoring metrics */
    detailedMonitoring: boolean;
  };
}

/**
 * Environment Configuration Factory
 *
 * Returns environment-specific configuration based on the deployment target.
 * Configurations are optimized for each environment's specific requirements:
 *
 * - DEV: Minimal resources, detailed logging, fast iteration
 * - STAGING: Production-like setup, cost-optimized, testing focus
 * - PROD: High availability, performance optimized, compliance ready
 *
 * @param environment - Target environment (dev, staging, prod)
 * @returns Environment-specific configuration object
 * @throws Error if environment is not recognized
 */
export function getConfig(environment: string): EnvironmentConfig {
  switch (environment) {
    case 'dev':
      // Development environment: Minimal cost, maximum observability
      return {
        environment: 'dev',
        database: {
          instanceClass: 'db.t3.micro',         // Burstable performance, low cost
          allocatedStorage: 20,                 // Minimal storage for development
          multiAz: false,                       // Single AZ to reduce costs
          backupRetentionDays: 7,              // Short retention for development
          deletionProtection: false            // Allow easy teardown
        },
        api: {
          memorySize: 512,                     // Minimal memory for basic testing
          timeout: 30,                         // Short timeout for quick feedback
          logRetentionDays: 7                  // Short log retention to reduce costs
        },
        stepFunctions: {
          timeout: 300,                        // 5 minutes for development workflows
          logLevel: 'ALL'                      // Maximum logging for debugging
        },
        monitoring: {
          createDashboard: true,               // Dashboard for development insights
          detailedMonitoring: true             // Detailed metrics for optimization
        }
      };

    case 'staging':
      // Staging environment: Production-like, cost-optimized for testing
      return {
        environment: 'staging',
        database: {
          instanceClass: 'db.t3.small',        // Small production-like instance
          allocatedStorage: 50,                // Moderate storage for testing data
          multiAz: false,                      // Single AZ for cost savings
          backupRetentionDays: 14,             // Moderate retention for testing
          deletionProtection: true             // Protect against accidental deletion
        },
        api: {
          reservedConcurrency: 50,             // Reserved concurrency for predictable performance
          memorySize: 1024,                    // Production-like memory allocation
          timeout: 60,                         // Extended timeout for complex operations
          logRetentionDays: 30                 // Extended log retention for analysis
        },
        stepFunctions: {
          timeout: 600,                        // 10 minutes for complex workflows
          logLevel: 'ERROR'                    // Production-like logging (errors only)
        },
        monitoring: {
          createDashboard: true,               // Dashboard for staging validation
          detailedMonitoring: true             // Detailed monitoring for performance testing
        }
      };

    case 'prod':
      // Production environment: High availability, performance, compliance
      return {
        environment: 'prod',
        database: {
          instanceClass: 'db.r5.large',        // Memory-optimized for production workload
          allocatedStorage: 100,               // Substantial storage for production data
          multiAz: true,                       // Multi-AZ for 99.9% availability SLA
          backupRetentionDays: 30,             // Extended retention for compliance
          deletionProtection: true             // Critical data protection
        },
        api: {
          reservedConcurrency: 100,            // High concurrency for 3K daily jobs
          memorySize: 2048,                    // High memory for optimal performance
          timeout: 120,                        // Extended timeout for complex processing
          logRetentionDays: 90                 // Extended retention for compliance/audit
        },
        stepFunctions: {
          timeout: 900,                        // 15 minutes for complex invoice processing
          logLevel: 'ERROR'                    // Error-only logging for performance
        },
        monitoring: {
          createDashboard: true,               // Production monitoring dashboard
          detailedMonitoring: true             // Comprehensive monitoring for SLA compliance
        }
      };

    default:
      throw new Error(`Unknown environment: ${environment}. Supported environments: dev, staging, prod`);
  }
}