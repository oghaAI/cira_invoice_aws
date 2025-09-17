# Gemini Context: CIRA Invoice Processing System

This document provides a comprehensive overview of the CIRA Invoice Processing System for the Gemini AI agent. It outlines the project's purpose, architecture, key technologies, and development conventions to ensure effective and context-aware collaboration.

## 1. Project Overview

The CIRA Invoice Processing System is an enterprise-scale, serverless application designed to automate invoice processing using OCR (Optical Character Recognition) and LLM (Large Language Model) data extraction. The system is built as a TypeScript monorepo on AWS.

- **Purpose**: To reduce manual invoice processing time, increase data extraction accuracy to over 95%, and provide a scalable, API-first solution for mid-market customers.
- **Core Functionality**: The system accepts a URL to a PDF invoice, processes it through a multi-stage pipeline involving OCR and LLM extraction, and returns structured JSON data.
- **Architecture**: A serverless, event-driven microservices architecture orchestrated by AWS Step Functions. The project is a monorepo containing multiple packages for different concerns (`api`, `database`, `infrastructure`, `shared`, `step-functions`).

## 2. Technology Stack

- **Language**: TypeScript (Strict Mode)
- **Runtime**: Node.js (>=20.17.0)
- **Package Manager**: npm (>=10.0.0)
- **Infrastructure as Code**: AWS CDK
- **API Framework**: Hono (running on AWS Lambda)
- **Workflow Orchestration**: AWS Step Functions
- **Database**: PostgreSQL (using Drizzle ORM)
- **Testing**: Vitest
- **Linting & Formatting**: ESLint & Prettier
- **External Services**:
    - **OCR**: Docling API
    - **LLM**: Azure OpenAI GPT-4

## 3. Building and Running the Project

### Key Scripts

The root `package.json` contains scripts to manage the monorepo.

- **Installation**:
  ```bash
  npm install
  ```
- **Setup Development Environment**:
  ```bash
  npm run setup:dev
  ```
- **Build all packages**:
  ```bash
  npm run build
  ```
- **Run tests**:
  ```bash
  npm run test
  ```
- **Run tests for a specific workspace**:
  ```bash
  npm run test --workspace=packages/api
  ```
- **Lint all packages**:
  ```bash
  npm run lint
  ```
- **Deploy infrastructure**:
  ```bash
  # This command is a wrapper for the infrastructure package's deploy script
  npm run deploy
  ```

### Infrastructure Deployment (from `packages/infrastructure`)

The `packages/infrastructure` directory contains the AWS CDK code.

- **Synthesize CloudFormation**:
  ```bash
  npm run synth
  ```
- **Show differences**:
  ```bash
  npm run diff
  ```
- **Deploy to a specific environment**:
  ```bash
  npm run deploy:dev
  npm run deploy:staging
  npm run deploy:prod
  ```

## 4. Development Conventions

- **Monorepo Structure**: The project is organized into workspaces within the `packages/` directory. Cross-package dependencies are managed by npm workspaces.
- **Coding Style**: Enforced by ESLint and Prettier. Run `npm run lint` and `npm run format` to check and fix issues.
- **Testing**: Vitest is used for unit and integration tests. Test files are co-located with source files (`*.test.ts`). The testing philosophy follows the test pyramid with a focus on unit tests (90% coverage goal).
- **Database**: Drizzle ORM is used for type-safe database access. Schema definitions are in `packages/database/src/schema`. Migrations are managed via Drizzle Kit.
- **Error Handling**: A centralized error management strategy is used with custom error classes and structured JSON logging via CloudWatch.
- **API**: The API is built with the Hono framework, optimized for serverless environments. The API specification is documented in OpenAPI 3.0 format in `docs/api-spec.yaml`.
- **Commit Messages**: The project is intended to use Conventional Commits, as mentioned in the PRD.
