# Security

## Input Validation
- **Validation Library:** Zod with custom PDF URL validators and schema integration
- **Validation Location:** API Gateway request validation + Lambda function validation (defense in depth)
- **Schema Integration:** Drizzle schema definitions automatically generate Zod validators
- **Required Rules:**
  - All PDF URLs MUST be validated for HTTPS protocol and accessible endpoints
  - URL sanitization to prevent SSRF attacks against internal AWS services
  - PDF content-type validation before processing to prevent malicious file uploads
  - Runtime type checking with compile-time TypeScript integration

## Authentication & Authorization  
- **Auth Method:** API Key authentication with bcrypt hashing (cost factor 12)
- **Session Management:** Stateless JWT tokens for internal service communication
- **Required Patterns:**
  - API keys MUST be transmitted only via X-API-Key header (never query parameters)
  - Rate limiting enforced at API Gateway level with Redis tracking per API key
  - API key rotation capability with 30-day expiration warnings

## Secrets Management
- **Development:** AWS Systems Manager Parameter Store with IAM-based access
- **Production:** AWS Secrets Manager with automatic rotation enabled
- **Code Requirements:**
  - NEVER hardcode secrets (enforced by pre-commit hooks)
  - Access secrets only through AWS SDK with IAM role assumption
  - No secrets in CloudWatch logs or error messages (sanitized logging)

## API Security
- **Rate Limiting:** 60 requests/minute per API key (configurable per client)
- **CORS Policy:** Strict origin control for web clients
- **Security Headers:** HSTS, Content-Security-Policy, X-Frame-Options
- **HTTPS Enforcement:** TLS 1.3 minimum with AWS Certificate Manager

## Data Protection  
- **Encryption at Rest:** AES-256 encryption for RDS and ElastiCache
- **Encryption in Transit:** TLS 1.3 for all service communication
- **PII Handling:** Invoice data classified as sensitive, audit trail required
- **Logging Restrictions:** Never log API keys, invoice content, or personal information

## Dependency Security
- **Scanning Tool:** npm audit with GitHub Dependabot
- **Update Policy:** Weekly dependency reviews with security patch priority
- **Approval Process:** Security review for new dependencies with supply chain validation

## Security Testing
- **SAST Tool:** ESLint security plugin with custom rules
- **DAST Tool:** OWASP ZAP integration in staging environment
- **Penetration Testing:** Quarterly external security assessment
