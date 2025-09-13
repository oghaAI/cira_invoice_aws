# Technical Assumptions

## Repository Structure: Monorepo
Single repository with separate packages for API services, database schemas, and shared utilities. Supports unified dependency management and simplified deployment coordination across microservices.

## Service Architecture
**Microservices with Step Functions Orchestration:** API Gateway routes requests to individual Lambda functions, with AWS Step Functions managing the processing workflow (queue → OCR → extraction → verification). This provides scalability and fault isolation while maintaining orchestration visibility.

## Testing Requirements
**Unit + Integration + E2E Testing:** Comprehensive testing pyramid including unit tests for business logic, integration tests for external service interactions (Docling, OpenAI), and end-to-end API testing for complete workflows. Manual testing convenience methods needed for invoice processing validation.

## Additional Technical Assumptions and Requests

**Core Technology Stack:**
- **Backend Framework:** Node.js with Express for Lambda functions, TypeScript for type safety
- **Database:** PostgreSQL on AWS RDS with connection pooling, Redis for caching job status
- **Infrastructure:** AWS ecosystem (API Gateway, Step Functions, Lambda, RDS, CloudWatch)
- **Container Strategy:** Docker for local development, serverless deployment for production

**External Service Integration:**
- **Primary OCR:** Docling OCR service with 5-minute timeout and exponential backoff retry
- **LLM Processing:** Azure OpenAI GPT-4 with structured output mode for data extraction
- **Future OCR Fallback:** Mistral OCR integration planned for Phase 2 dual-validation

**Data Management:**
- **Job Identifiers:** NanoID for shorter, URL-safe job IDs vs UUID
- **Data Retention:** 90-day retention policy for job data and results
- **Cost Tracking:** Per-job cost attribution including all external API usage
- **Encryption:** AES-256 encryption at rest, TLS 1.3 for data in transit

**Development & Deployment:**
- **Version Control:** Git with conventional commits for automated changelog generation  
- **CI/CD Pipeline:** GitHub Actions with automated testing and AWS deployment
- **Monitoring:** AWS CloudWatch for metrics, structured JSON logging for debugging
- **Environment Management:** Development, staging, and production environments with infrastructure as code

**Performance & Scalability:**
- **Concurrent Processing:** Support for 20-25 concurrent jobs with auto-scaling Lambda functions
- **Database Optimization:** Connection pooling and read replicas for query scaling
- **Caching Strategy:** Redis for job status caching to reduce database load
- **Rate Limiting:** API Gateway rate limiting to prevent service abuse
