# Introduction

This document outlines the overall project architecture for **CIRA Invoice Processing System**, including backend systems, shared services, and non-UI specific concerns. Its primary goal is to serve as the guiding architectural blueprint for AI-driven development, ensuring consistency and adherence to chosen patterns and technologies.

**Relationship to Frontend Architecture:**
The system is primarily API-first with a minimal dashboard planned for Phase 2. A separate Frontend Architecture Document may be created if the UI components expand beyond basic monitoring and management interfaces. Core technology stack choices documented herein are definitive for the entire project, including any frontend components.

## Starter Template or Existing Project

**Decision:** Custom AWS CDK setup from scratch

**Rationale:** Given the specific requirements for Step Functions orchestration, monorepo structure, and infrastructure as code, a custom AWS CDK setup provides the most alignment with the architectural vision while avoiding template constraints. This approach offers maximum control over the serverless architecture design and scaling patterns needed for the invoice processing workflow.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-09-10 | 1.0 | Initial architecture document creation | Winston (Architect) |
| 2025-09-10 | 1.1 | Updated to use Drizzle ORM 0.44.x and Zod 4.1.x for improved type safety and serverless performance | Winston (Architect) |
| 2025-09-10 | 1.2 | Simplified stack: Removed Redis, replaced Axios/Winston with native Node.js, upgraded to Vitest, simplified error handling | Winston (Architect) |
| 2025-09-10 | 1.3 | Updated JobResult schema to match InvoiceSchema with 21 specific fields, removed LineItem table for simplified data model | Winston (Architect) |
