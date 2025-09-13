# Technical Assumptions

## Repository Structure: Monorepo
Single repository with minimal packages: `api/`, `database/`, `infrastructure/` only.

## Service Architecture
**Minimal Serverless:** API Gateway routes to Lambda functions, Step Functions manages 3-step workflow (OCR → Extract → Complete), PostgreSQL for all storage.

## Testing Requirements
**Focus on Critical Path:** Test happy path scenarios with basic integration tests for external services (Docling, OpenAI).

## Additional Technical Assumptions

**Simplified Technology Stack:**
- **Language:** TypeScript 5.6.2, Node.js 20.17.0
- **Framework:** Hono 4.6.3 for minimal API performance
- **Database:** PostgreSQL 16.4 only (no Redis/caching)
- **Infrastructure:** AWS CDK 2.158.0 with minimal constructs
- **HTTP Client:** Native Node.js fetch (zero dependencies)
- **Validation:** Basic input validation (no Zod)
- **Testing:** Vitest 2.1.x for speed
- **Monitoring:** CloudWatch only (basic console.log)

**External Services:**
- **OCR:** Docling API with basic timeout handling
- **LLM:** Azure OpenAI GPT-4-turbo with structured output
- **No fallback services initially** - keep it simple

**Removed Complexity:**
- ❌ Redis caching (PostgreSQL handles all storage)
- ❌ Complex error handling libraries
- ❌ ORM layers (direct SQL queries)
- ❌ Advanced monitoring and alerting
- ❌ Complex authentication (simple API keys)
- ❌ Dashboard/UI components
