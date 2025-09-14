# Introduction

This document outlines the **MVP-focused architecture** for **CIRA Invoice Processing System**, stripping away over-engineering to focus on the bare minimum needed to process invoices successfully. This architecture prioritizes getting to market quickly with a working system that can be iteratively improved based on real customer feedback.

**Key Principle:** Build the simplest thing that could possibly work, then iterate based on real usage.

## Starter Template or Existing Project

**Decision:** Custom AWS CDK setup from scratch (minimal configuration)

**Rationale:** While templates exist, a custom setup gives us maximum control over the serverless architecture while keeping dependencies minimal. We'll start with basic CDK constructs and add complexity only when proven necessary.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-09-11 | 2.0 | MVP-focused architecture - removed over-engineering | Winston (Architect) |
