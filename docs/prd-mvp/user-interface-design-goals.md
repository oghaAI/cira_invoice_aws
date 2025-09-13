# User Interface Design Goals

## Overall UX Vision
**API-first MVP** - No dashboard required for initial release. Clean, minimal API documentation with job monitoring capabilities through direct API calls.

## Key Interaction Paradigms
- **Direct API Usage:** All interactions through 3 core endpoints
- **Simple Status Polling:** Basic GET requests for job status updates
- **JSON-First Results:** Direct JSON responses for easy integration

## Core API Endpoints
- **POST /jobs** - Submit PDF for processing
- **GET /jobs/{id}/status** - Check processing status  
- **GET /jobs/{id}/result** - Retrieve extracted data

## Target Platforms
API-only service for MVP - web dashboard deferred to Phase 2
