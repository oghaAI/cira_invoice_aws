# Test Strategy and Standards

## Testing Philosophy
- **Approach:** Test-Driven Development for business logic, test-after for integration layers
- **Coverage Goals:** 90% unit test coverage, 80% integration test coverage, 70% E2E coverage
- **Test Pyramid:** 70% unit tests, 20% integration tests, 10% end-to-end tests

## Unit Tests
- **Framework:** Vitest 2.1.x with TypeScript support and coverage reporting
- **File Convention:** `*.test.ts` files co-located with source code
- **Location:** `src/**/*.test.ts` in each package
- **Mocking Library:** Vitest built-in mocking with custom AWS SDK mocks
- **Coverage Requirement:** 90% minimum for services and repositories

**AI Agent Requirements:**
- Generate tests for all public methods and exported functions
- Cover edge cases including null inputs, invalid data, and boundary conditions  
- Follow AAA pattern (Arrange, Act, Assert) with descriptive test names
- Mock all external dependencies including AWS services and HTTP clients

## Integration Tests
- **Scope:** Cross-service integration, database operations, external API interactions
- **Location:** `tests/integration/` directory in each package
- **Test Infrastructure:**
  - **Database:** Docker PostgreSQL container for test isolation
  - **External APIs:** WireMock for Docling and OpenAI API stubbing

## End-to-End Tests
- **Framework:** Vitest with Hono's testing utilities for API testing
- **Scope:** Complete invoice processing workflows from API request to result storage
- **Environment:** Staging environment with real AWS services and mock external APIs
- **Test Data:** Synthetic PDF invoices with known expected extraction results

## Test Data Management
- **Strategy:** Factory pattern with synthetic data generation
- **Fixtures:** JSON fixtures for consistent test data
- **Factories:** Builder pattern for complex object creation
- **Cleanup:** Automated test data cleanup with database transactions

## Continuous Testing
- **CI Integration:** GitHub Actions with parallel test execution
- **Performance Tests:** Load testing with Artillery.js for API endpoints
- **Security Tests:** OWASP dependency checking and static analysis
