# Infrastructure and Deployment

## Infrastructure as Code
- **Tool:** AWS CDK 2.100.x with TypeScript constructs
- **Location:** `packages/infrastructure/` in monorepo
- **Approach:** Environment-specific stacks with shared construct libraries

## Deployment Strategy
- **Strategy:** Blue-Green deployment with AWS CodeDeploy
- **CI/CD Platform:** GitHub Actions with AWS OIDC integration
- **Pipeline Configuration:** `.github/workflows/deploy.yml` with environment gates

## Environments
- **Development:** Single AZ, shared resources, local DynamoDB
- **Staging:** Multi-AZ, production-like scaling, full external API integration  
- **Production:** Multi-AZ, auto-scaling, comprehensive monitoring and alerting

## Environment Promotion Flow
```
Development → Staging → Production
     ↓            ↓           ↓
Local Testing  → Integration → Blue-Green
Manual Deploy   Auto Deploy   Auto Deploy
```

## Rollback Strategy
- **Primary Method:** AWS CodeDeploy automatic rollback on CloudWatch alarms
- **Trigger Conditions:** Error rate >1%, response time >5s, any Lambda function errors
- **Recovery Time Objective:** <5 minutes for automatic rollback, <15 minutes for manual intervention
