# Coding Standards

## Core Standards
- **Languages & Runtimes:** Node.js 20.11.0, TypeScript 5.3.3 with strict mode enabled
- **Style & Linting:** ESLint with @typescript-eslint/recommended, Prettier with 2-space indentation
- **Test Organization:** Tests co-located with source code, `.test.ts` suffix, AAA pattern

## Critical Rules
- **Use structured console logging with JSON format and correlation IDs for CloudWatch**
- **All API responses must use standardized ApiResponse wrapper type with error codes**
- **Database queries must use Drizzle ORM with type-safe query builder, never raw SQL in business logic**
- **All schemas must be defined with Drizzle and validated with Zod for type safety**
- **External API calls must use native fetch with timeout handling**
- **All currency amounts must use Decimal type to prevent floating-point errors**
- **Secrets access only through AWS SDK with IAM roles, never environment variables**
