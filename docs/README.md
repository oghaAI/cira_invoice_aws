# CIRA Invoice Processing API Documentation

This directory contains comprehensive API documentation for the CIRA Invoice Processing System.

## 📖 Documentation Files

- **`api-spec.yaml`** - OpenAPI 3.0 specification (source of truth)
- **`api-spec.json`** - JSON version of the OpenAPI spec
- **`api-docs.html`** - Interactive Scalar documentation (generated)
- **`generate-docs.js`** - Documentation generation script

## 🚀 Quick Start

### View Documentation

**Option 1: Local File**
```bash
# Open the HTML file directly in your browser
open docs/api-docs.html
```

**Option 2: Local Server** (Recommended)
```bash
# Serve docs on http://localhost:3001
npm run docs:serve
```

**Option 3: Generate and Serve**
```bash
# Generate docs and start server
npm run docs:dev
```

### Update Documentation

1. **Edit the OpenAPI spec**: Modify `docs/api-spec.yaml`
2. **Regenerate docs**: Run `npm run docs:generate`
3. **View changes**: Refresh your browser or restart the server

## 🔧 Available Scripts

```bash
# Generate documentation from OpenAPI spec
npm run docs:generate

# Start local documentation server on port 3001
npm run docs:serve

# Generate docs and start server in one command
npm run docs:dev
```

## 📋 API Overview

The CIRA Invoice Processing API provides the following functionality:

### Core Workflow
1. **Submit PDF** → `POST /jobs` with PDF URL
2. **Monitor Progress** → `GET /jobs/{id}/status`
3. **Retrieve Results** → `GET /jobs/{id}/result`

### Available Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check |
| `POST` | `/jobs` | Create processing job |
| `GET` | `/jobs/{id}` | Get job details |
| `GET` | `/jobs/{id}/status` | Get job status |
| `GET` | `/jobs/{id}/result` | Get extraction results |
| `GET` | `/jobs/{id}/ocr` | Get raw OCR text |

### Authentication
All endpoints (except health check) require API key authentication via the `X-API-Key` header.

## 🔍 Features

### Comprehensive Documentation
- **Interactive API Explorer** - Test endpoints directly in the browser
- **Request/Response Examples** - Real examples for all endpoints
- **Schema Documentation** - Detailed breakdown of all data structures
- **Error Handling** - Complete error response documentation

### Rich Data Structures
- **Reasoned Fields** - AI extraction includes reasoning and confidence
- **Job Status Tracking** - Real-time processing phases
- **Flexible OCR Access** - Raw and processed OCR text retrieval

## 🏗️ Architecture Integration

### Lambda Function Mapping
The documented endpoints map to these Lambda handlers:

- `packages/api/src/handlers/job-management.ts` - All API endpoints
- Routes configured in `packages/infrastructure/src/stacks/api-stack.ts`

### Database Integration
- Jobs stored in PostgreSQL via RDS Proxy
- Results stored in `job_results` table with extracted data
- Client isolation via API Gateway `client_id`

### Processing Workflow
1. **API Gateway** → Authentication & routing
2. **Lambda Handler** → Request processing & validation
3. **Step Functions** → Orchestrates OCR + LLM pipeline
4. **Database** → Stores jobs, status, and results

## 🔮 Future Enhancements

### Planned Features
- **Webhook Support** - Push notifications for job completion
- **Batch Processing** - Submit multiple PDFs at once
- **Advanced Filtering** - Search jobs by date, status, etc.
- **Rate Limiting Info** - Expose rate limit headers

### Documentation Improvements
- **Code Samples** - SDK examples in multiple languages
- **Postman Collection** - Import ready collection
- **Changelog** - API version history
- **Performance Specs** - Response time benchmarks

## 📝 Contributing

### Updating the API Spec

1. **Modify `api-spec.yaml`** with your changes
2. **Validate the spec** using online OpenAPI validators
3. **Regenerate documentation** with `npm run docs:generate`
4. **Test the changes** in the interactive docs

### Schema Updates

When adding new Zod schemas in the code:

1. **Extract the schema** to OpenAPI components
2. **Add examples** showing realistic data
3. **Document the reasoning** for complex fields
4. **Test with real API responses**

---

## 🆘 Support

For API questions or issues:
- Check the interactive documentation for examples
- Review the OpenAPI specification for technical details
- Test endpoints using the built-in API explorer
- Refer to the source code in `packages/api/src/handlers/`
