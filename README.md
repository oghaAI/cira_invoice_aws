# CIRA Invoice Processing System

> Enterprise-scale serverless invoice processing system with OCR and LLM data extraction capabilities.

## 🏗️ Architecture

This is a **TypeScript monorepo** built with **AWS CDK** for Infrastructure as Code, featuring a complete **3-stage processing pipeline**:

- **API Gateway + Lambda** for RESTful API endpoints
- **PostgreSQL RDS** with Drizzle ORM for data persistence
- **Step Functions** for workflow orchestration and retry logic
- **Docling OCR API** for PDF text extraction
- **Azure OpenAI GPT-4** with AI SDK for structured data extraction
- **Comprehensive validation** with Zod schemas
- **CloudWatch** for monitoring and logging

## 🎯 Current Implementation Status

**✅ Completed Features (Stories 1.1-3.3):**
- Complete project setup with AWS CDK infrastructure
- Database schema with job tracking and results storage
- API endpoints for job creation and status checking
- Step Functions workflow with retry and error handling
- OCR processing with Docling integration
- LLM extraction with Azure OpenAI and Zod validation
- Comprehensive test coverage across all components

**🔄 In Progress (Story 3.4):**
- Results API endpoint (`GET /jobs/{id}/result`) - Ready for Review

**📋 Planned Features:**
- Basic cost tracking and reporting
- Enhanced monitoring and alerting

## 📦 Project Structure

```
cira-invoice-aws/
├── packages/
│   ├── api/                    # API Lambda functions (Hono framework)
│   ├── database/               # Database layer (Drizzle ORM + PostgreSQL)
│   ├── shared/                 # Shared utilities and types
│   ├── infrastructure/         # AWS CDK infrastructure definitions
│   └── step-functions/         # Step Functions workflow definitions
├── scripts/                    # Development and deployment scripts
├── .github/workflows/          # CI/CD pipelines
└── docs/                       # Architecture and API documentation
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 20.17.0
- **npm** >= 10.0.0
- **AWS CLI** configured with appropriate permissions
- **AWS CDK** >= 2.214.0
- **PostgreSQL** for local development (or Docker)
- **Azure OpenAI** API key for LLM processing
- **Docling API** access for OCR processing

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd cira-invoice-aws

# Install dependencies
npm install

# Setup development environment
npm run setup:dev
```

### Development Workflow

```bash
# Build all packages
npm run build

# Run tests across all packages
npm run test

# Run linting and formatting
npm run lint
npm run format

# Start development mode (with file watching)
npm run dev
```

## 🔧 Development Setup

### Environment Configuration

1. **AWS Configuration**
   ```bash
   aws configure
   # Or use AWS SSO, environment variables, or IAM roles
   ```

2. **Environment Variables**
   ```bash
   # Copy example environment files (if available)
   cp .env.example .env.local

   # Configure required environment variables:
   # - AZURE_OPENAI_API_KEY
   # - AZURE_OPENAI_ENDPOINT
   # - DOCLING_API_KEY (if required)
   # - DATABASE_URL (for local development)
   vim .env.local
   ```

3. **Database Setup** (for local development)
   ```bash
   # Start local PostgreSQL (using Docker)
   docker run --name cira-postgres \
     -e POSTGRES_PASSWORD=password \
     -e POSTGRES_DB=cira_invoice \
     -p 5432:5432 -d postgres:16

   # Run database migrations
   cd packages/database
   npm run db:migrate
   ```

### IDE Configuration

#### VS Code

Install recommended extensions:
- TypeScript and JavaScript Language Features
- ESLint
- Prettier
- AWS Toolkit

#### Settings

```json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

## 🧪 Testing

### Test Structure

- **Unit Tests**: `*.test.ts` files co-located with source code
- **Integration Tests**: `tests/integration/` directories in each package
- **E2E Tests**: `tests/e2e/` in the root directory

### Running Tests

```bash
# Run all tests
npm run test

# Run tests with coverage
npm test -- --coverage

# Run tests in watch mode
npm test -- --watch

# Run specific package tests
npm run test --workspace=packages/api
```

### Coverage Requirements

- **Unit Tests**: 90% minimum coverage
- **Integration Tests**: 80% minimum coverage  
- **E2E Tests**: 70% minimum coverage

## 🚀 Deployment

### Environment Overview

| Environment | Branch | AWS Account | Purpose |
|-------------|--------|-------------|---------|
| Development | `develop` | dev-account | Feature development and testing |
| Staging | `develop` | staging-account | Pre-production validation |
| Production | `main` | prod-account | Live system |

### Manual Deployment

```bash
# Deploy to development
cd packages/infrastructure
npm run deploy:dev

# Deploy to staging  
npm run deploy:staging

# Deploy to production
npm run deploy:prod
```

### CI/CD Pipeline

Deployments are automated via GitHub Actions:

- **Pull Requests**: Run tests and linting
- **Develop Branch**: Auto-deploy to staging environment
- **Main Branch**: Auto-deploy to production environment

## 📊 Monitoring & Observability

### CloudWatch Integration

- **Structured Logging**: JSON format with correlation IDs
- **Metrics**: Custom application metrics and AWS service metrics
- **Alarms**: Automated alerting for critical issues
- **Dashboards**: Real-time operational visibility

### Local Development Monitoring

```bash
# View application logs
npm run logs

# Monitor API performance
npm run monitor:api

# Database query analysis
npm run monitor:db
```

## 🏗️ Package Details

### API Package (`packages/api`)

**Framework**: Hono (serverless-optimized) + AI SDK for Azure OpenAI
**Purpose**: Lambda function handlers for job management, OCR processing, and LLM extraction

**Key Components:**
- Job Management API (`/jobs` endpoint)
- OCR Processing Lambda (Docling integration)
- LLM Extraction Lambda (Azure OpenAI + Zod validation)
- Results API (`/jobs/{id}/result` endpoint)

```bash
cd packages/api
npm run dev        # Start development mode
npm run build      # Compile TypeScript
npm run test       # Run comprehensive test suite
```

### Database Package (`packages/database`)

**ORM**: Drizzle ORM 0.44.x with PostgreSQL
**Purpose**: Schema definitions, migrations, and database client

**Key Features:**
- Job tracking with status management
- OCR results storage (JSONB)
- LLM extraction results with confidence scores
- Token usage tracking for cost monitoring

```bash
cd packages/database
npm run db:generate    # Generate migration files
npm run db:migrate     # Apply migrations
npm run db:studio      # Open Drizzle Studio
```

### Infrastructure Package (`packages/infrastructure`)

**Framework**: AWS CDK 2.214.0
**Purpose**: Complete serverless infrastructure deployment

**Key Stacks:**
- API Gateway with Lambda integration
- Step Functions workflow orchestration
- PostgreSQL RDS with auto-scaling
- CloudWatch monitoring and logging

```bash
cd packages/infrastructure
npm run synth          # Generate CloudFormation templates
npm run diff           # Show infrastructure changes
npm run deploy         # Deploy infrastructure
```

### Shared Package (`packages/shared`)

**Purpose**: Common utilities, types, and validation schemas

### Step Functions Package (`packages/step-functions`)

**Purpose**: Workflow definitions for invoice processing pipeline

## 🔐 Security

### Security Practices

- **IAM Roles**: Least privilege access patterns
- **Secrets Management**: AWS Secrets Manager integration
- **API Security**: Authentication via API keys with bcrypt hashing
- **Network Security**: VPC isolation and security groups
- **Data Protection**: Encryption at rest and in transit

### Security Scanning

```bash
# Run security audit
npm audit

# Run vulnerability scanning (requires Snyk token)
npx snyk test
```

## 🤝 Contributing

### Development Workflow

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Changes**
   - Follow coding standards (ESLint + Prettier)
   - Write tests for new functionality
   - Update documentation if needed

3. **Test Changes**
   ```bash
   npm run test
   npm run lint
   npm run build
   ```

4. **Submit Pull Request**
   - Target the `develop` branch
   - Include clear description of changes
   - Ensure all CI checks pass

### Code Standards

- **TypeScript**: Strict mode enabled with comprehensive type safety
- **Linting**: ESLint with TypeScript rules
- **Formatting**: Prettier with 2-space indentation
- **Testing**: Vitest with AAA pattern (Arrange, Act, Assert)

## 📚 Documentation

- **API Documentation**: `docs/api-spec.yaml` - OpenAPI 3.0 specification
- **Architecture**: `docs/architecture.md` - Complete system design document
- **Stories**: `docs/stories/` - Detailed implementation stories (1.1-3.4)
- **PRD**: `docs/prd-mvp.md` - Product requirements and MVP scope
- **QA Reports**: `docs/qa/` - Quality assurance and testing documentation

## 🔄 Processing Pipeline

The system implements a **3-stage serverless processing pipeline**:

### Stage 1: Job Creation
- Client submits PDF URL via `POST /jobs`
- System validates URL and creates job record
- Returns job ID for tracking

### Stage 2: OCR Processing
- Step Functions triggers OCR Lambda
- Docling API extracts text from PDF
- Raw text stored in database with metadata

### Stage 3: LLM Extraction
- Azure OpenAI processes OCR text
- Zod schema validates extracted data
- Structured JSON stored with confidence scores

### Results Retrieval
- Client polls `GET /jobs/{id}` for status
- Completed jobs accessible via `GET /jobs/{id}/result`
- Returns structured invoice data with metadata

## 🛠️ Troubleshooting

### Common Issues

**Build Failures**
```bash
# Clear dependency cache
rm -rf node_modules package-lock.json
npm install

# Rebuild all packages
npm run clean
npm run build
```

**Test Failures**
```bash
# Run tests with verbose output
npm test -- --verbose

# Check for TypeScript errors
npm run build
```

**Deployment Issues**
```bash
# Check AWS credentials
aws sts get-caller-identity

# Validate CDK configuration
cd packages/infrastructure
npm run synth
```

### Getting Help

- **Internal Documentation**: Check `docs/` directory
- **GitHub Issues**: Report bugs and feature requests
- **Team Chat**: #cira-invoice-dev channel

## 📄 License

This project is proprietary and confidential. Unauthorized copying, distribution, or use is strictly prohibited.

---

**Maintained by**: CIRA Development Team
**Last Updated**: 2025-09-15
**Implementation Status**: MVP features completed (Stories 1.1-3.3), Story 3.4 ready for review