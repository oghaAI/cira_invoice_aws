# Brainstorming Session Results

**Session Date:** 2025-09-10
**Facilitator:** Business Analyst Mary
**Participant:** User

## Executive Summary

**Topic:** AI-powered invoice processing system on AWS

**Session Goals:** Component-by-component deep dive for implementation planning

**Techniques Used:** Morphological Analysis (Component-by-component breakdown)

**Total Ideas Generated:** 41 specific implementation decisions and design choices

### Key Themes Identified:
- Scalable API design with queue-based processing
- Unified endpoint handling multiple input types
- Simple but secure authentication approach
- Queue-driven architecture for managing concurrency

## Technique Sessions

### Morphological Analysis - Component Deep Dive - 15 minutes

**Description:** Systematic breakdown of each system component to explore design decisions and implementation options

#### Ideas Generated:

**API Gateway/Entry Point Component:**
1. Single endpoint with content-type detection (URL vs binary)
2. API key authentication for simplicity and security
3. Queue-based processing to handle traffic beyond 20-25 concurrent limit
4. Immediate job ID return for status polling
5. Request validation and sanitization layer

**Job Management & Status Tracking Component:**
6. NanoID or UUID for job identification (NanoID preferred for shorter IDs)
7. Job state progression: `queued` → `processing_ocr` → `extracting_data` → `verifying` → `completed`/`failed`
8. AWS Step Functions for orchestration (recommended over SQS for complex workflows)
9. Main database for status persistence (single source of truth)
10. Polling endpoint returning current state + progress indicators
11. Error state handling with retry mechanisms

**PDF Input Layer Component:**
12. URL-only input (simplified scope - no binary uploads for now)
13. URL validation before queuing to ensure PDF accessibility
14. Stream PDF directly from URL to OCR service (no local storage)
15. One job processes one PDF URL

**OCR Integration Component:**
16. Primary OCR: Docling service as first attempt
17. Fallback OCR: Mistral OCR if Docling fails validation
18. LLM validation step: Check if OCR output contains expected invoice data
19. Retry mechanism: 2 retries per OCR service before failure
20. Timeout handling: 5-minute timeout per OCR attempt
21. Output format: Accept whatever markdown structure OCR provides
22. Failure response: Detailed error messages returned to API poller

**LLM Processing Engine Component:**
23. Model: OpenAI GPT-4.1 Nano via Azure OpenAI Service
24. Schema flexibility: Configurable default schema + optional API-provided schema
25. Schema override: API requesters can send custom extraction schema per job
26. Existing prompts: Use current prompts, optimize later in development cycle
27. Structured output: AI SDK structured output for consistent JSON responses
28. Model configuration: Defer temperature/tokens/fallbacks to later optimization phase

**Data Verification Layer Component:**
29. Secondary LLM verification: Use another LLM to validate extracted data
30. Verification failure handling: Flag jobs as "needs_review" status
31. Partial results delivery: Return extracted data even when flagged for review
32. Review workflow: Send current extraction results for human review
33. Business rules: No specific validation rules initially (keep flexible)
34. Quality assurance: Two-LLM approach ensures higher accuracy

**Database Layer Component:**
35. Database: PostgreSQL (likely on AWS RDS)
36. Table structure: Normalized design with separate tables for different data types
37. Jobs table: job_id, status, timestamps, metadata
38. Processing tables: OCR markdown, LLM traces, final extraction results
39. Trace data: LLM input/output and associated costs per operation
40. Data retention: User-configurable retention policies
41. Cost tracking: Detailed LLM usage and cost attribution per job

#### Insights Discovered:
- Queue architecture solves both concurrency management and scalability
- Single endpoint approach reduces API complexity while maintaining flexibility
- API keys provide good balance of security vs implementation simplicity
- Step Functions provide better workflow orchestration than simple queues
- NanoID offers shorter, URL-safe identifiers vs UUIDs
- Two-LLM verification approach (extraction + validation) ensures higher accuracy
- Configurable schema design provides flexibility for different client needs
- URL-only approach simplifies initial implementation scope
- Normalized database design enables better data organization and querying
- Cost tracking provides transparency and accountability for LLM usage

#### Notable Connections:
- Queue decision directly impacts job management and status tracking components
- Authentication choice affects monitoring and logging requirements
- Step Functions choice enables better error handling and retry logic
- Job states directly map to system component boundaries
- OCR fallback strategy (Docling → Mistral) provides reliability
- Schema configurability affects both API design and database structure
- Verification layer creates additional job state ("needs_review")
- Database design must support all processing stages and trace data

## Idea Categorization

### Immediate Opportunities
*Ideas ready to implement now*

1. **API Gateway with Step Functions**
   - Description: Single endpoint with API key auth, NanoID job IDs, immediate Step Functions orchestration
   - Why immediate: Well-defined AWS services, straightforward implementation
   - Resources needed: AWS account, API Gateway + Step Functions setup

2. **URL Validation & Job Management**
   - Description: PDF URL validation before queuing, PostgreSQL job status tracking
   - Why immediate: Standard validation patterns, basic CRUD operations
   - Resources needed: URL validation library, PostgreSQL database setup

3. **Docling OCR Integration**
   - Description: Primary OCR service integration with 5-minute timeouts and retry logic
   - Why immediate: External API integration, well-documented service
   - Resources needed: Docling API credentials, HTTP client configuration

### Future Innovations
*Ideas requiring development/research*

1. **Dual-LLM Verification System**
   - Description: Two-stage LLM processing (extraction + verification) with cost tracking
   - Development needed: Prompt engineering, verification logic, cost calculation algorithms
   - Timeline estimate: 2-3 weeks development + testing

2. **Configurable Schema System**
   - Description: Default extraction schema + API-provided custom schemas per job
   - Development needed: Schema validation, dynamic prompt generation, flexible database design
   - Timeline estimate: 3-4 weeks development + testing

3. **OCR Fallback Strategy**
   - Description: Docling → LLM validation → Mistral OCR fallback chain
   - Development needed: LLM-based validation prompts, service switching logic, error handling
   - Timeline estimate: 2-3 weeks development + testing

### Moonshots
*Ambitious, transformative concepts*

1. **Intelligent Schema Evolution**
   - Description: System learns optimal extraction schemas based on success rates and user feedback
   - Transformative potential: Automated improvement of extraction accuracy over time
   - Challenges to overcome: ML pipeline, feedback loops, schema optimization algorithms

2. **Multi-Modal Invoice Processing**
   - Description: Handle not just PDFs but images, emails, and other document formats
   - Transformative potential: Universal invoice processing regardless of input format
   - Challenges to overcome: Multiple OCR strategies, format detection, unified processing pipeline

### Insights & Learnings
*Key realizations from the session*

- **Architecture simplicity**: Starting with URL-only input dramatically reduces initial complexity while maintaining core functionality
- **Queue-based scalability**: Step Functions + database polling provides natural scaling and reliability patterns
- **Cost transparency**: Tracking LLM costs per job enables client billing and system optimization
- **Verification strategy**: Two-LLM approach balances accuracy with processing cost and time
- **Schema flexibility**: Configurable extraction schemas provide client customization without system redesign

## Action Planning

### Top 3 Priority Ideas

#### #1 Priority: API Gateway with Step Functions
- **Rationale**: Foundation for entire system, enables all other components to function
- **Next steps**: AWS infrastructure setup, API design, Step Functions workflow definition
- **Resources needed**: AWS architect, backend developer, API documentation
- **Timeline**: 1-2 weeks

#### #2 Priority: PostgreSQL Database Design
- **Rationale**: Data persistence is critical, affects all downstream components
- **Next steps**: Schema design, table relationships, indexing strategy, migration scripts
- **Resources needed**: Database architect, PostgreSQL setup, connection pooling
- **Timeline**: 1-2 weeks

#### #3 Priority: Docling OCR Integration
- **Rationale**: Core functionality, enables the primary processing pipeline
- **Next steps**: API credentials, integration testing, error handling, timeout configuration
- **Resources needed**: External service setup, HTTP client, retry mechanism implementation
- **Timeline**: 1 week

## Reflection & Follow-up

### What Worked Well
- Systematic component-by-component analysis provided comprehensive coverage
- Clear decision-making on technology choices (Step Functions, PostgreSQL, OpenAI)
- Practical focus on implementation reality vs theoretical perfection

### Areas for Further Exploration
- Monitoring & alerting strategy: How to track system health and performance
- Security hardening: Beyond API keys, what additional security measures are needed
- Performance optimization: Caching strategies, connection pooling, async processing patterns
- Cost optimization: LLM usage patterns, bulk processing discounts, schema efficiency

### Recommended Follow-up Techniques
- **Risk Analysis**: What could go wrong with each component and how to mitigate
- **Implementation Timeline**: Detailed project breakdown with dependencies and milestones
- **Performance Testing**: Load testing strategy for 20-25 concurrent request target

### Questions That Emerged
- What specific invoice fields will the default schema extract?
- How will clients be notified of "needs_review" status jobs?
- What retry/backoff strategies should be used for external service failures?
- How will system performance be monitored and alerted?

### Next Session Planning
- **Suggested topics:** Database schema design deep dive, Step Functions workflow definition, monitoring and alerting strategy
- **Recommended timeframe:** 1-2 weeks after initial infrastructure decisions are made
- **Preparation needed:** Review Step Functions documentation, PostgreSQL schema examples, monitoring best practices

---

*Session facilitated using the BMAD-METHOD™ brainstorming framework*
