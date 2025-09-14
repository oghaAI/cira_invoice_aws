# Infrastructure and Deployment

## Infrastructure as Code
- **Tool:** AWS CDK 2.158.0 with minimal constructs
- **Location:** `packages/infrastructure/`
- **Approach:** Single-stack deployment for MVP

## Deployment Strategy
- **Strategy:** Simple push-to-deploy via CDK
- **CI/CD Platform:** GitHub Actions (basic workflow)
- **Pipeline Configuration:** `.github/workflows/deploy.yml`

## Environments
- **Development:** Local development with LocalStack
- **Production:** Single AWS environment

## Rollback Strategy
- **Primary Method:** CDK rollback command
- **Trigger Conditions:** Manual only for MVP
- **Recovery Time Objective:** <30 minutes manual intervention
