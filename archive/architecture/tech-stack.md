# Tech Stack

## Cloud Infrastructure

**Provider:** AWS  
**Key Services:** API Gateway, Lambda, Step Functions, RDS PostgreSQL, CloudWatch  
**Deployment Regions:** us-east-1 (primary)

## Technology Stack Table

| Category | Technology | Version | Purpose | Rationale |
|----------|------------|---------|---------|-----------|
| **Language** | TypeScript | 5.6.2 | Primary development language | Strong typing, excellent tooling, latest stable release |
| **Runtime** | Node.js | 20.17.0 | JavaScript runtime | Latest LTS version, stable performance, security updates |
| **Framework** | Hono | 4.6.3 | API framework for Lambda | Serverless-optimized, 3x faster cold starts, TypeScript native |
| **Database** | PostgreSQL | 16.4 | Primary data store | ACID compliance for financial data, latest stable with performance improvements |
| **Infrastructure** | AWS CDK | 2.158.0 | Infrastructure as Code | Version-controlled infrastructure, latest stable with new constructs |
| **ORM** | Drizzle ORM | 0.44.x | Database abstraction | Type-safe SQL queries, serverless-optimized, superior TypeScript inference |
| **Migration Tool** | Drizzle Kit | 0.44.x | Schema migrations | Type-safe migrations with automatic SQL generation |
| **Validation** | Zod | 4.1.x | Schema validation | TypeScript-first validation, runtime type checking, Drizzle integration |
| **HTTP Client** | Node.js fetch | 20.17.0 | External API calls | Native HTTP client, built-in timeout support, zero dependencies |
| **Logging** | console + CloudWatch | Native | Structured logging | JSON logging with CloudWatch integration, correlation IDs |
| **Hashing** | bcrypt | 5.1.1 | API key hashing | Secure password hashing, configurable cost factor |
| **ID Generation** | crypto.randomUUID | 20.17.0 | Job ID generation | Native UUID generation, cryptographically secure |
| **Testing** | Vitest | 2.1.x | Testing framework | Fast execution, superior TypeScript support, modern testing experience |
| **Linting** | ESLint | 9.10.0 | Code quality | Code consistency, error prevention, TypeScript rules |
| **Formatting** | Prettier | 3.3.3 | Code formatting | Automated formatting, team consistency |
| **CI/CD** | GitHub Actions | N/A | Deployment automation | PRD requirement, AWS integration, OIDC support |
| **Monitoring** | CloudWatch | N/A | Logging & metrics | Native AWS integration, cost tracking, alarms |
| **External OCR** | Docling API | Latest | PDF text extraction | PRD requirement, 5-minute timeout |
| **External LLM** | Azure OpenAI GPT-4 | gpt-4-turbo | Data extraction | Latest model, structured output mode, cost optimization |
