# CIRA Invoice Processing System

> AWS-based serverless invoice processing system with OCR and LLM data extraction capabilities.

## 🏗️ Architecture

This is a **TypeScript monorepo** built with **AWS CDK** for Infrastructure as Code, featuring:

- **API Gateway + Lambda** for RESTful API endpoints
- **PostgreSQL RDS** for data persistence  
- **Step Functions** for workflow orchestration
- **Docling API** for OCR text extraction
- **Azure OpenAI GPT-4** for structured data extraction
- **CloudWatch** for monitoring and logging

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
   # Copy example environment files
   cp .env.example .env.local
   
   # Configure your environment-specific values
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

**Framework**: Hono 4.9.6 (serverless-optimized)
**Purpose**: Lambda function handlers and middleware

```bash
cd packages/api
npm run dev        # Start development mode
npm run build      # Compile TypeScript
npm run test       # Run unit tests
```

### Database Package (`packages/database`)

**ORM**: Drizzle ORM 0.44.x with PostgreSQL
**Purpose**: Schema definitions, migrations, and queries

```bash
cd packages/database
npm run db:generate    # Generate migration files
npm run db:migrate     # Apply migrations
npm run db:studio      # Open Drizzle Studio
```

### Infrastructure Package (`packages/infrastructure`)

**Framework**: AWS CDK 2.214.0
**Purpose**: Infrastructure as Code definitions

```bash
cd packages/infrastructure
npm run synth          # Generate CloudFormation templates
npm run diff           # Show infrastructure changes
npm run deploy         # Deploy infrastructure
```

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

- **API Documentation**: `docs/api/` - OpenAPI specifications
- **Architecture**: `docs/architecture/` - System design documents
- **Deployment**: `docs/deployment/` - Environment setup guides

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
**Last Updated**: 2024-01-15