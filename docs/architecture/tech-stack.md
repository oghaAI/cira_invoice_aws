# Tech Stack

## Cloud Infrastructure

**Provider:** AWS
**Key Services:** API Gateway, Lambda, Step Functions, RDS PostgreSQL
**Deployment Regions:** us-east-1 (single region for MVP)

## Technology Stack Table

| Category | Technology | Version | Purpose | Rationale |
|----------|------------|---------|---------|-----------|
| **Language** | TypeScript | 5.6.2 | Primary language | Type safety + rapid development |
| **Runtime** | Node.js | 20.17.0 | JavaScript runtime | Latest LTS, reliable |
| **Framework** | Hono | 4.6.3 | Minimal API framework | Fastest serverless performance |
| **Database** | PostgreSQL | 16.4 | Single data store | ACID compliance, handles all use cases |
| **Infrastructure** | AWS CDK | 2.158.0 | Infrastructure as Code | Version-controlled infrastructure |
| **HTTP Client** | Node.js fetch | 20.17.0 | External API calls | Built-in, zero dependencies |
| **Validation** | Basic validation | Native | Input validation | Keep it simple initially |
| **Testing** | Vitest | 2.1.x | Testing framework | Fast, TypeScript-native |
| **Monitoring** | CloudWatch | Native | Basic logging | AWS-native, zero setup |
| **External OCR** | Docling API | Latest | PDF processing | PRD requirement |
| **External LLM** | Azure OpenAI | gpt-4-turbo | Data extraction | PRD requirement |

**Removed from Original Architecture:**
- ❌ Redis/ElastiCache (PostgreSQL handles caching)
- ❌ bcrypt (simple API key validation)
- ❌ Winston logging (basic console.log)
- ❌ Complex error handling libraries
- ❌ Drizzle ORM (direct SQL queries)
- ❌ Zod validation (basic input validation)
