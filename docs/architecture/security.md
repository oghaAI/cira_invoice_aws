# Security

## Input Validation
- **Validation Location:** API Gateway + Lambda function entry points
- **Required Rules:**
  - PDF URL format validation (HTTPS required)
  - API key presence validation
  - Basic XSS prevention

## Authentication & Authorization
- **Auth Method:** Simple API key in header (`X-API-Key`)
- **Required Patterns:**
  - Validate API key exists and is active
  - Log all authentication attempts

## Secrets Management
- **Development:** Environment variables
- **Production:** AWS Systems Manager Parameter Store
- **Code Requirements:**
  - No hardcoded secrets
  - Access via process.env only

## Data Protection
- **Encryption at Rest:** RDS default encryption
- **Encryption in Transit:** HTTPS only
- **Logging Restrictions:** Never log PDF content or API keys
