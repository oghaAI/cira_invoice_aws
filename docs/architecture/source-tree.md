# Source Tree

```
cira-invoice-aws/
├── packages/
│   ├── api/                    # API Lambda functions
│   │   ├── src/
│   │   │   ├── handlers/       # Lambda handlers
│   │   │   │   ├── jobs.ts     # Job management
│   │   │   │   ├── status.ts   # Status checking
│   │   │   │   └── results.ts  # Result retrieval
│   │   │   ├── services/       # Business logic
│   │   │   │   ├── job-service.ts
│   │   │   │   ├── ocr-service.ts
│   │   │   │   └── llm-service.ts
│   │   │   └── utils/          # Simple utilities
│   │   │       ├── db.ts       # Database connection
│   │   │       └── config.ts   # Configuration
│   │   └── package.json
│   ├── database/               # Database setup
│   │   ├── schema.sql          # Database schema
│   │   └── seed.sql            # Sample data
│   └── infrastructure/         # AWS CDK
│       ├── src/
│       │   ├── api-stack.ts    # API Gateway + Lambda
│       │   ├── db-stack.ts     # RDS PostgreSQL
│       │   └── workflow-stack.ts # Step Functions
│       └── package.json
├── scripts/
│   ├── deploy.sh               # Simple deployment
│   └── setup-db.sh             # Database setup
├── package.json                # Root dependencies
└── README.md                   # Getting started guide
```
