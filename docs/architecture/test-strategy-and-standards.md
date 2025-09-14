# Test Strategy and Standards

## Testing Philosophy
- **Approach:** Test the critical path, skip edge cases initially
- **Coverage Goals:** 70% for core services
- **Test Pyramid:** Mostly integration tests, minimal unit tests

## Unit Tests
- **Framework:** Vitest 2.1.x
- **File Convention:** `*.test.ts`
- **Coverage Requirement:** Core business logic only

**AI Agent Requirements:**
- Focus on happy path testing
- Mock external services (Docling, OpenAI)
- Test database operations with real database

## Integration Tests
- **Scope:** End-to-end API testing
- **Test Infrastructure:** Docker PostgreSQL for tests
- **Coverage:** All API endpoints with valid inputs
