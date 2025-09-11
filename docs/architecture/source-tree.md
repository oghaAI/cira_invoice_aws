# Source Tree

```
cira-invoice-aws/
├── packages/
│   ├── api/                           # API Lambda functions
│   │   ├── src/
│   │   │   ├── handlers/              # Lambda function handlers
│   │   │   │   ├── auth.ts           # API key authentication
│   │   │   │   ├── jobs.ts           # Job management endpoints
│   │   │   │   ├── status.ts         # Job status tracking
│   │   │   │   └── results.ts        # Result retrieval
│   │   │   ├── services/             # Business logic services
│   │   │   │   ├── job-manager.ts    # Job lifecycle management
│   │   │   │   ├── ocr-processor.ts  # Docling integration
│   │   │   │   ├── llm-extractor.ts  # OpenAI integration
│   │   │   │   └── cost-tracker.ts   # Cost attribution
│   │   │   ├── middleware/           # Hono middleware
│   │   │   │   ├── auth.ts           # Authentication middleware  
│   │   │   │   ├── validation.ts     # Zod schema validation
│   │   │   │   ├── error-handler.ts  # Error management
│   │   │   │   └── cors.ts           # CORS configuration
│   │   │   └── utils/                # Utility functions
│   │   │       ├── logger.ts         # Structured logging
│   │   │       ├── config.ts         # Configuration management
│   │   │       └── validators.ts     # Zod schema validators
│   │   ├── tests/                    # API-specific tests
│   │   ├── package.json              # API dependencies
│   │   └── tsconfig.json             # TypeScript configuration
│   ├── database/                      # Database layer
│   │   ├── src/
│   │   │   ├── schema/               # Drizzle schema definitions
│   │   │   │   ├── job.schema.ts    # Job table schema
│   │   │   │   ├── job-result.schema.ts # JobResult table schema with InvoiceSchema fields
│   │   │   │   ├── api-key.schema.ts # ApiKey table schema
│   │   │   │   └── processing-event.schema.ts # ProcessingEvent table schema
│   │   │   ├── queries/              # Type-safe query functions
│   │   │   │   ├── job.queries.ts
│   │   │   │   ├── result.queries.ts
│   │   │   │   └── event.queries.ts
│   │   │   ├── migrations/           # Drizzle migrations
│   │   │   │   └── 0000_initial_schema.sql
│   │   │   └── seeders/              # Development data
│   │   ├── tests/                    # Database tests
│   │   └── package.json              # Database dependencies
│   ├── shared/                        # Shared utilities and types
│   │   ├── src/
│   │   │   ├── types/                # Shared TypeScript types
│   │   │   │   ├── job.types.ts     # Job-related types
│   │   │   │   ├── api.types.ts     # API request/response types
│   │   │   │   └── config.types.ts  # Configuration types
│   │   │   ├── constants/            # Application constants
│   │   │   │   ├── job-status.ts    # Job status enums
│   │   │   │   └── error-codes.ts   # Standardized error codes
│   │   │   └── utils/                # Shared utilities
│   │   │       ├── nanoid.ts        # ID generation
│   │   │       ├── retry.ts         # Retry logic
│   │   │       └── cost-calculator.ts # Cost calculation
│   │   └── package.json              # Shared dependencies
│   ├── infrastructure/                # AWS CDK infrastructure
│   │   ├── src/
│   │   │   ├── stacks/               # CDK stack definitions
│   │   │   │   ├── api-stack.ts     # API Gateway and Lambda
│   │   │   │   ├── database-stack.ts # RDS and ElastiCache
│   │   │   │   ├── workflow-stack.ts # Step Functions
│   │   │   │   └── monitoring-stack.ts # CloudWatch and alarms
│   │   │   ├── constructs/           # Reusable CDK constructs
│   │   │   │   ├── lambda-api.ts    # Lambda function construct
│   │   │   │   └── secure-database.ts # Encrypted database construct
│   │   │   └── config/               # Environment configurations
│   │   │       ├── dev.ts           # Development settings
│   │   │       ├── staging.ts       # Staging settings
│   │   │       └── prod.ts          # Production settings
│   │   ├── cdk.json                  # CDK configuration
│   │   └── package.json              # Infrastructure dependencies
│   └── step-functions/                # Step Functions definitions
│       ├── src/
│       │   ├── definitions/          # State machine definitions
│       │   │   └── invoice-processing.json # Main workflow
│       │   ├── tasks/                # Step Function task implementations
│       │   │   ├── ocr-task.ts      # OCR processing task
│       │   │   ├── llm-task.ts      # LLM extraction task
│       │   │   └── validation-task.ts # Result validation task
│       │   └── utils/                # Step Function utilities
│       └── package.json              # Step Functions dependencies
├── scripts/                           # Development and deployment scripts
│   ├── deploy.sh                     # Deployment automation
│   ├── seed-data.sh                  # Database seeding
│   ├── run-tests.sh                  # Test execution
│   └── setup-dev.sh                  # Development environment setup
├── docs/                             # Documentation
│   ├── api/                          # API documentation
│   ├── deployment/                   # Deployment guides
│   └── architecture.md               # This document
├── .github/                          # GitHub configuration
│   └── workflows/                    # CI/CD workflows
│       ├── test.yml                 # Test automation
│       ├── deploy-staging.yml       # Staging deployment
│       └── deploy-production.yml    # Production deployment
├── package.json                      # Root package.json with workspaces
├── tsconfig.json                     # Root TypeScript configuration
├── jest.config.js                    # Root Jest configuration
├── .eslintrc.js                      # ESLint configuration
├── .prettierrc                       # Prettier configuration
└── README.md                         # Project documentation
```
