# Error Handling Strategy

## General Approach
- **Error Model:** Simple try/catch with basic error objects
- **Exception Hierarchy:** Native Error objects with custom messages
- **Error Propagation:** Basic error bubbling to API layer

## Logging Standards
- **Library:** console.log with JSON formatting
- **Format:** `{"level": "error", "message": "...", "jobId": "...", "timestamp": "..."}`
- **Levels:** ERROR, INFO only for MVP

## External API Error Handling
- **Retry Policy:** Step Functions default retry (3 attempts)
- **Timeout Configuration:** 5 minutes OCR, 30 seconds LLM
- **Error Translation:** Basic error message passthrough
