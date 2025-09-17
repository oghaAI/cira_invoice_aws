# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Build System
```bash
# Build all packages (monorepo-wide)
npm run build

# Build specific package
npm run build --workspace=packages/api
npm run build --workspace=packages/database
npm run build --workspace=packages/infrastructure

# Clean build artifacts
npm run clean
```

### Testing
```bash
# Run all tests with Vitest
npm run test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage (80% minimum required)
npm run test:coverage

# Run specific package tests
npm run test --workspace=packages/api
npm run test --workspace=packages/database

# Run integration tests
npm run test:all
```

### Database Operations
```bash
# Generate Drizzle migration files
cd packages/database && npm run db:generate

# Apply database migrations
cd packages/database && npm run db:migrate

# Open Drizzle Studio for database management
cd packages/database && npm run db:studio
```

### AWS Deployment
```bash
# Deploy infrastructure to development
cd packages/infrastructure && npm run deploy:dev

# Deploy to staging
cd packages/infrastructure && npm run deploy:staging

# Deploy to production
cd packages/infrastructure && npm run deploy:prod

# Generate CloudFormation templates (dry-run)
cd packages/infrastructure && npm run synth

# Show infrastructure diff before deployment
cd packages/infrastructure && npm run diff
```

### Code Quality
```bash
# Run ESLint across all packages
npm run lint

# Format code with Prettier
npm run format

# Development mode with file watching
npm run dev
```

## Architecture Overview

This is a **TypeScript monorepo** implementing a **3-stage serverless invoice processing pipeline** on AWS:

### Monorepo Structure
- **packages/api**: Hono-based Lambda functions for REST API endpoints
- **packages/database**: Drizzle ORM with PostgreSQL data layer
- **packages/infrastructure**: AWS CDK infrastructure-as-code definitions
- **packages/shared**: Common types, utilities, and validation schemas
- **packages/step-functions**: Step Functions workflow orchestration

### Core Processing Pipeline
1. **Job Creation** (`POST /jobs`) - Client submits PDF URL, system creates job record
2. **OCR Processing** - Step Functions triggers Docling API for text extraction
3. **LLM Extraction** - Azure OpenAI processes OCR text with Zod schema validation
4. **Results Retrieval** (`GET /jobs/{id}/result`) - Structured invoice data returned

### Key Technology Stack
- **API Framework**: Hono (serverless-optimized) with AI SDK for Azure OpenAI
- **Database**: PostgreSQL RDS with Drizzle ORM 0.44.x
- **Infrastructure**: AWS CDK 2.214.0, Step Functions, Lambda, API Gateway
- **Testing**: Vitest with coverage thresholds (80% minimum)
- **AI Integration**: Azure OpenAI GPT-4 with structured output validation

## Package-Specific Guidance

### API Package (`packages/api`)
- **Entry Point**: `src/index.ts` exports Lambda handlers
- **Handlers**: Located in `src/handlers/` directory
  - `job-management.ts`: Job CRUD operations and status tracking
  - `ocr-processing.ts`: Docling API integration for PDF text extraction
  - `llm-extraction.ts`: Azure OpenAI integration with Zod validation
- **Dependencies**: Uses `@cira/database` and `@cira/shared` for data access and types
- **Testing**: Comprehensive unit and integration tests with mocking

### Database Package (`packages/database`)
- **ORM**: Drizzle ORM with PostgreSQL adapter
- **Models**: `src/models/` contains schema definitions (job.ts, jobResult.ts)
- **Repositories**: `src/repositories/` provides data access layer
- **Migrations**: Use `db:generate` and `db:migrate` commands
- **Connection**: Exported database client and schemas from `src/index.ts`

### Infrastructure Package (`packages/infrastructure`)
- **CDK App**: `src/app.ts` defines the main CDK application
- **Stacks**: Modular stack definitions in `src/stacks/`
- **Environments**: Support for dev/staging/prod with context switching
- **Dependencies**: Must build database package first (`build:app` script handles this)

### Shared Package (`packages/shared`)
- **Types**: Common TypeScript interfaces and types
- **Utilities**: Helper functions used across packages
- **Validation**: Zod schemas for request/response validation

## Development Guidelines

### TypeScript Configuration
- **Strict Mode**: All strict TypeScript options enabled
- **Module System**: NodeNext with ES2022 target
- **Project References**: Uses TypeScript project references for monorepo builds
- **Incremental**: Builds are incremental with `.tsbuildinfo` files

### Testing Standards
- **Framework**: Vitest with node environment
- **Coverage**: 80% minimum for functions/lines, 70% for branches
- **Test Location**: Co-located with source code (`*.test.ts` files)
- **Timeouts**: 10s test timeout, 5s teardown timeout
- **Parallelization**: Multi-threaded test execution (max 4 threads)

### Database Development
- **Schema Changes**: Always generate migrations with `db:generate`
- **Local Development**: Uses PostgreSQL with connection via DATABASE_URL
- **Type Safety**: Drizzle provides full TypeScript integration
- **Relationships**: Jobs have one-to-one relationship with JobResults

### AWS Infrastructure
- **CDK Version**: Pin to 2.214.0 for consistency
- **Environment Variables**: Use AWS Secrets Manager for sensitive data
- **IAM**: Follows least-privilege access patterns
- **Monitoring**: CloudWatch integration for logging and metrics

### API Development
- **Framework**: Hono optimized for AWS Lambda cold starts
- **Validation**: Input validation using Zod schemas from shared package
- **Error Handling**: Structured error responses with proper HTTP status codes
- **CORS**: Configured for cross-origin requests

## Environment Setup Requirements

- **Node.js**: >= 20.17.0 (specified in package.json engines)
- **npm**: >= 10.0.0
- **AWS CLI**: Configured with appropriate permissions
- **PostgreSQL**: For local database development
- **Environment Variables**:
  - `AZURE_OPENAI_API_KEY`: Required for LLM processing
  - `AZURE_OPENAI_ENDPOINT`: Azure OpenAI service endpoint
  - `DATABASE_URL`: PostgreSQL connection string

## Common Development Workflows

### Adding New API Endpoint
1. Define handler in `packages/api/src/handlers/`
2. Add route to main router in `packages/api/src/index.ts`
3. Create corresponding tests
4. Update shared types if needed

### Database Schema Changes
1. Modify schema in `packages/database/src/models/`
2. Generate migration: `cd packages/database && npm run db:generate`
3. Apply locally: `npm run db:migrate`
4. Test with updated code
5. Deploy infrastructure with new schema

### Infrastructure Updates
1. Modify CDK constructs in `packages/infrastructure/src/`
2. Preview changes: `npm run diff`
3. Deploy to dev: `npm run deploy:dev`
4. Test functionality
5. Promote through staging to production