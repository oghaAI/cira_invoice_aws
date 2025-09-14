# CIRA Invoice Processing System - Product Manager's Guide

**For Product Managers New to the Codebase**
**Version:** 1.0
**Date:** September 14, 2025

---

## Table of Contents

1. [What This System Does](#what-this-system-does)
2. [Business Value & Goals](#business-value--goals)
3. [How It Works (High-Level)](#how-it-works-high-level)
4. [System Architecture Overview](#system-architecture-overview)
5. [Key Technologies Explained](#key-technologies-explained)
6. [Data Flow: From PDF to Structured Data](#data-flow-from-pdf-to-structured-data)
7. [API Endpoints (Customer Interface)](#api-endpoints-customer-interface)
8. [Current Feature Set](#current-feature-set)
9. [Development Status](#development-status)
10. [Infrastructure & Deployment](#infrastructure--deployment)
11. [Performance & Scalability](#performance--scalability)
12. [Costs & Pricing Model](#costs--pricing-model)
13. [Security & Compliance](#security--compliance)
14. [Common Business Questions & Answers](#common-business-questions--answers)

---

## What This System Does

**CIRA (Invoice Processing System)** is a serverless AWS-based service that converts PDF invoices into structured JSON data automatically. Think of it as a smart document processor that:

- **Takes**: PDF invoice URLs from customers
- **Processes**: Extracts text using OCR (Optical Character Recognition)
- **Transforms**: Converts raw text into structured data using AI (LLM)
- **Returns**: Clean JSON data with vendor names, amounts, dates, line items, etc.

### Simple Example
```
Input:  "https://customer.com/invoice-123.pdf"
Output: {
  "vendor_name": "Acme Corp",
  "invoice_number": "INV-001",
  "total_amount": 1250.00,
  "invoice_date": "2024-01-15",
  "line_items": [...],
  "confidence_score": 0.95
}
```

---

## Business Value & Goals

### Primary Goals
- **Volume**: Process 3,000 invoices/day (90,000/month) at enterprise scale
- **Speed**: Reduce processing time from 15-30 minutes (manual) to under 2 minutes (automated)
- **Accuracy**: Achieve 95% accuracy rate for standard invoice formats
- **Cost**: Maintain processing costs below $0.30 per invoice at volume
- **Scalability**: Handle peak loads of 125+ invoices/hour automatically

### Target Market
- **Mid-to-large organizations** with high-volume invoice processing needs
- **Accounting/finance teams** seeking automation without complex software
- **Companies** currently doing manual data entry from PDF invoices

### Business Model
- **API-first service** - customers integrate directly into their systems
- **Pay-per-use pricing** - no upfront costs, scales with usage
- **Volume discounts** - cost per invoice decreases with volume

---

## How It Works (High-Level)

The system follows a simple 3-step process orchestrated by AWS Step Functions:

### Step 1: OCR Processing (Text Extraction)
- Customer submits PDF URL via API
- System validates and processes the PDF through OCR service (Mistral/Docling)
- Raw text is extracted and stored

### Step 2: LLM Data Extraction (AI Processing)
- OCR text is sent to Azure OpenAI GPT-4
- AI extracts structured invoice data using predefined schema
- Confidence scores are calculated for each field

### Step 3: Results Storage & Delivery
- Structured data is stored in PostgreSQL database
- Customer can retrieve results via API
- System tracks token usage for billing

### Visual Flow
```
PDF URL → API Gateway → Lambda → Step Functions
                                      ↓
                                OCR Service (Mistral)
                                      ↓
                                PostgreSQL ← OpenAI GPT-4
                                      ↓
                                Customer retrieves via API
```

---

## System Architecture Overview

### Architecture Style: **Serverless Microservices**
- **No servers to manage** - everything runs on AWS Lambda
- **Auto-scaling** - handles traffic spikes automatically
- **Pay-per-use** - only costs money when processing invoices
- **High availability** - AWS manages uptime and failover

### Core Components

#### 1. **API Gateway** (Customer Interface)
- **Purpose**: Receives customer requests and manages API keys
- **Endpoints**:
  - `POST /jobs` - Submit invoice for processing
  - `GET /jobs/{id}/status` - Check processing status
  - `GET /jobs/{id}` - Get full job details
  - `GET /jobs/{id}/ocr` - Get raw OCR text (debugging)

#### 2. **Lambda Functions** (Business Logic)
- **Job Management**: Handles API requests, job creation, status updates
- **OCR Processing**: Integrates with external OCR service
- **LLM Extraction**: Sends text to OpenAI and processes responses

#### 3. **Step Functions** (Workflow Orchestration)
- **Purpose**: Manages the 3-step processing workflow
- **Benefits**: Visual monitoring, automatic retries, error handling
- **States**: Start → OCR → LLM → Complete

#### 4. **PostgreSQL Database** (Data Storage)
- **Jobs Table**: Tracks processing requests and status
- **Job Results Table**: Stores extracted data and metadata
- **Scalable**: Handles 3,000+ jobs/day with proper indexing

#### 5. **External Services**
- **Mistral OCR API**: Converts PDF to text
- **Azure OpenAI**: Extracts structured data from text

---

## Key Technologies Explained

### **TypeScript & Node.js**
- **What**: Programming language and runtime
- **Why**: Type safety prevents bugs, Node.js is fast for serverless
- **Business impact**: Reliable code, faster development

### **AWS CDK (Infrastructure as Code)**
- **What**: Code that creates AWS resources
- **Why**: Version-controlled, repeatable deployments
- **Business impact**: Consistent environments, easy rollbacks

### **Hono Framework**
- **What**: Lightweight web framework for APIs
- **Why**: Optimized for serverless, faster than alternatives
- **Business impact**: Better performance = lower costs

### **Drizzle ORM**
- **What**: Database interface layer
- **Why**: Type-safe database queries, prevents SQL injection
- **Business impact**: Secure, maintainable database code

### **Vitest**
- **What**: Testing framework
- **Why**: Fast test execution, good TypeScript support
- **Business impact**: Reliable software, faster development cycles

---

## Data Flow: From PDF to Structured Data

### 1. **Customer Submission**
```json
POST /jobs
{
  "pdf_url": "https://customer.com/invoice.pdf"
}
```

### 2. **System Response** (Immediate)
```json
{
  "job_id": "abc-123-def",
  "status": "queued",
  "created_at": "2024-01-15T10:30:00Z"
}
```

### 3. **Status Updates** (During Processing)
```json
GET /jobs/abc-123-def/status
{
  "id": "abc-123-def",
  "status": "processing",
  "phase": "analyzing_invoice",
  "phase_label": "Analyzing invoice"
}
```

### 4. **Final Results** (After Completion)
```json
GET /jobs/abc-123-def
{
  "id": "abc-123-def",
  "status": "completed",
  "extracted_data": {
    "vendor_name": "Acme Corp",
    "invoice_number": "INV-2024-001",
    "invoice_date": "2024-01-10",
    "total_amount": 1250.00,
    "line_items": [
      {
        "description": "Professional Services",
        "quantity": 10,
        "unit_price": 125.00,
        "total": 1250.00
      }
    ]
  },
  "confidence_score": 0.95,
  "tokens_used": 1500
}
```

---

## API Endpoints (Customer Interface)

### Authentication
- **Method**: API Keys in header (`X-API-Key`)
- **Setup**: Keys managed through AWS API Gateway
- **Usage Plans**: Rate limiting and quotas per customer

### Core Endpoints

#### `POST /jobs` - Submit Invoice
- **Purpose**: Start processing a new invoice
- **Input**: PDF URL (must be HTTPS)
- **Response**: Job ID and initial status
- **Rate Limit**: 100 requests/minute

#### `GET /jobs/{id}/status` - Check Status
- **Purpose**: Monitor processing progress
- **Response**: Current status and processing phase
- **Statuses**: queued → processing → completed/failed

#### `GET /jobs/{id}` - Get Full Results
- **Purpose**: Retrieve extracted invoice data
- **Response**: Complete job details with structured data
- **Available**: Only after status = "completed"

#### `GET /jobs/{id}/ocr` - Get Raw OCR Text
- **Purpose**: Debugging and validation
- **Response**: Raw text extracted from PDF
- **Use case**: Troubleshooting extraction issues

---

## Current Feature Set

### ✅ **Completed Features (MVP)**

#### **Core Processing Pipeline**
- PDF URL validation and processing
- OCR text extraction via Mistral API
- GPT-4 data extraction with structured output
- End-to-end workflow orchestration
- Results storage and retrieval

#### **API Management**
- RESTful API with proper error handling
- API key authentication and rate limiting
- Job status tracking with processing phases
- Health check endpoint for monitoring

#### **Data Management**
- PostgreSQL database with proper indexing
- JSONB storage for flexible invoice data
- Token usage tracking for cost visibility
- Job lifecycle management (creation to completion)

#### **Infrastructure**
- Serverless AWS architecture with auto-scaling
- Infrastructure as Code with AWS CDK
- Multi-environment deployment (dev/staging/prod)
- CloudWatch monitoring and logging

### 🚧 **In Development**
- Advanced error handling and retry logic
- Performance optimizations for high volume
- Enhanced monitoring and alerting
- Cost optimization features

### 📋 **Planned Features (Phase 2)**
- Web dashboard for job monitoring
- Batch processing capabilities
- Custom invoice schemas per customer
- Enhanced accuracy with fine-tuned models
- Real-time processing status via WebSocket

---

## Development Status

### **Current Phase**: MVP Complete ✅
- **Timeline**: Completed September 2025
- **Status**: Production-ready for initial customers
- **Capacity**: Handles 3,000 invoices/day

### **Implementation Phases Completed**

#### **Phase 1: Foundation (Weeks 1-2)** ✅
- API Gateway with core endpoints
- PostgreSQL database with schema
- Basic Lambda functions and authentication
- Infrastructure automation with CDK

#### **Phase 2: Processing Pipeline (Weeks 3-4)** ✅
- Step Functions workflow (3 states)
- Mistral OCR integration
- OpenAI GPT-4 extraction
- End-to-end invoice processing

#### **Phase 3: Production Readiness (Weeks 5-6)** ✅
- Deployment automation
- Monitoring and logging
- Error handling and retries
- Initial customer testing

### **Current Metrics** (as of September 2025)
- **Success Rate**: 85-90% on standard invoices
- **Processing Time**: Average 90 seconds per invoice
- **Error Rate**: <5% for valid PDF inputs
- **Uptime**: 99.8% over past 30 days

---

## Infrastructure & Deployment

### **AWS Services Used**

#### **API Gateway**
- **Purpose**: API endpoint management
- **Features**: Rate limiting, API keys, CORS
- **Cost**: $3.50 per million requests

#### **Lambda Functions**
- **Purpose**: Serverless compute for business logic
- **Languages**: Node.js 20.x with TypeScript
- **Cost**: $0.20 per 1M requests + compute time

#### **Step Functions**
- **Purpose**: Workflow orchestration
- **Benefits**: Visual monitoring, automatic retries
- **Cost**: $0.025 per 1,000 state transitions

#### **PostgreSQL RDS**
- **Purpose**: Data storage and job management
- **Configuration**: db.t3.micro (expandable)
- **Cost**: ~$15/month + storage

#### **CloudWatch**
- **Purpose**: Monitoring and logging
- **Features**: Error tracking, performance metrics
- **Cost**: ~$5/month for logs + metrics

### **Deployment Process**

#### **Environments**
- **Development**: For feature development
- **Staging**: Pre-production testing
- **Production**: Live customer system

#### **Deployment Method**
- **Tool**: AWS CDK (Infrastructure as Code)
- **Process**: `npm run deploy:prod`
- **Time**: ~15 minutes for full deployment
- **Rollback**: CDK rollback in <5 minutes

#### **CI/CD Pipeline**
- **GitHub Actions** for automated testing
- **Automatic deployment** on main branch merge
- **Manual approval** required for production

---

## Performance & Scalability

### **Current Performance**
- **Throughput**: 3,000 invoices/day (125/hour peak)
- **Processing Time**: 90 seconds average per invoice
- **Success Rate**: 85-90% for standard invoices
- **API Response Time**: <200ms for status checks

### **Scalability Features**

#### **Auto-Scaling Components**
- **Lambda Functions**: Scale to 1,000 concurrent executions
- **API Gateway**: Handles millions of requests per day
- **Database**: Read replicas and connection pooling
- **Step Functions**: Manages workflow concurrency

#### **Performance Optimizations**
- **Database Indexing**: Optimized for job status queries
- **Connection Pooling**: Reduces database overhead
- **Caching**: API Gateway caching for status endpoints
- **Parallel Processing**: Multiple invoices processed simultaneously

### **Bottlenecks & Limits**

#### **External Service Limits**
- **Mistral OCR**: Rate limits may require throttling
- **OpenAI API**: Token rate limits for GPT-4
- **Solution**: Queue management and retry logic

#### **Database Performance**
- **Current**: Handles 3,000 jobs/day comfortably
- **Scaling**: Can upgrade to larger RDS instances
- **Monitoring**: CloudWatch tracks connection counts

---

## Costs & Pricing Model

### **System Operating Costs** (per invoice)

#### **AWS Services** (~$0.15/invoice)
- **Lambda compute**: $0.05
- **API Gateway**: $0.02
- **Step Functions**: $0.01
- **Database**: $0.02
- **CloudWatch**: $0.01
- **Other AWS**: $0.04

#### **External Services** (~$0.10/invoice)
- **Mistral OCR**: $0.05 (estimated)
- **OpenAI GPT-4**: $0.05 (based on tokens)

#### **Total Cost**: ~$0.25 per invoice at volume

### **Revenue Model**

#### **Pricing Tiers** (suggested)
- **Starter**: $0.50/invoice (up to 100/month)
- **Professional**: $0.35/invoice (up to 1,000/month)
- **Enterprise**: $0.30/invoice (3,000+/month)

#### **Gross Margins**
- **Starter**: 50% margin
- **Professional**: 43% margin
- **Enterprise**: 20% margin

### **Cost Scaling**
- **Fixed costs**: ~$50/month (infrastructure baseline)
- **Variable costs**: Scale linearly with volume
- **Economies of scale**: Better GPT-4 pricing at high volume

---

## Security & Compliance

### **Security Measures**

#### **API Security**
- **Authentication**: API keys with rate limiting
- **HTTPS Only**: All communications encrypted
- **Input Validation**: PDF URL format and accessibility checks
- **CORS**: Properly configured for web applications

#### **Data Protection**
- **Encryption at Rest**: RDS database encryption
- **Encryption in Transit**: HTTPS/TLS for all connections
- **Access Control**: IAM roles with least privilege
- **Secrets Management**: AWS Secrets Manager for credentials

#### **Network Security**
- **VPC Isolation**: Lambda functions in private subnets
- **Security Groups**: Restricted access to database
- **No Public Access**: Database not accessible from internet

### **Compliance Considerations**

#### **Data Handling**
- **Data Retention**: Jobs auto-deleted after 90 days
- **PII Protection**: No customer data logged in CloudWatch
- **Access Logs**: API Gateway logs for audit trails
- **Backup**: Database automated backups for 7 days

#### **Privacy**
- **Customer Data**: Processed PDFs not permanently stored
- **Confidentiality**: Each customer only sees their own jobs
- **Data Location**: All processing within US regions

---

## Common Business Questions & Answers

### **Q: How accurate is the system?**
**A:** Currently 85-90% accuracy for standard invoices. Accuracy varies by:
- **Invoice format complexity**: Simple formats = higher accuracy
- **PDF quality**: Clear, text-based PDFs work best
- **Language**: Optimized for English invoices
- **Handwritten content**: Not well supported yet

### **Q: What happens when processing fails?**
**A:** The system provides detailed error information:
- **OCR failures**: Usually due to PDF format/corruption
- **LLM failures**: Rare, typically retry automatically
- **Customer impact**: Failed jobs don't incur charges
- **Debugging**: Raw OCR text available for troubleshooting

### **Q: How do we handle customer support?**
**A:** Built-in debugging capabilities:
- **Job status API**: Real-time processing updates
- **Error messages**: Descriptive failure reasons
- **OCR text access**: Raw extracted text for validation
- **Logs**: CloudWatch logs for technical investigation

### **Q: Can we customize the data extraction?**
**A:** Current limitations and future plans:
- **Now**: Fixed invoice schema (vendor, amount, date, etc.)
- **Phase 2**: Custom schemas per customer/use case
- **Configuration**: Extractable via API or dashboard
- **Timeline**: Q1 2025 for custom schema support

### **Q: What's our competitive advantage?**
**A:** Key differentiators:
- **API-first**: Easy integration vs. complex software
- **Serverless**: No infrastructure management required
- **Pay-per-use**: No upfront costs or commitments
- **Fast setup**: Live in hours, not weeks/months
- **Scalable**: Handles enterprise volume automatically

### **Q: How do we scale to larger customers?**
**A:** Built for enterprise scale:
- **Current capacity**: 3,000 invoices/day
- **Scaling**: Can increase to 10,000+/day with configuration
- **Bottlenecks**: External API rate limits (manageable)
- **Enterprise features**: Dedicated instances, custom SLAs

### **Q: What's the roadmap for new features?**
**A:** Planned enhancements:
- **Q4 2024**: Web dashboard, batch processing
- **Q1 2025**: Custom schemas, enhanced accuracy
- **Q2 2025**: Real-time processing, webhook notifications
- **Q3 2025**: Multi-language support, handwritten text

### **Q: How do we price for different markets?**
**A:** Flexible pricing strategy:
- **SMB**: Higher per-unit price, lower commitment
- **Enterprise**: Volume discounts, custom terms
- **International**: Regional pricing adjustments
- **Usage-based**: Scales with customer success

---

## Getting Started as a PM

### **Key Dashboards to Monitor**
1. **AWS CloudWatch**: System health and performance
2. **API Gateway Console**: API usage and errors
3. **Step Functions Console**: Processing workflows
4. **RDS Console**: Database performance

### **Important Metrics to Track**
- **Success rate**: % of jobs completing successfully
- **Processing time**: Average time per invoice
- **Error rates**: By error type and customer
- **API usage**: Requests per customer/day
- **Cost per invoice**: Track against revenue

### **Customer Onboarding Checklist**
1. **Generate API key** via AWS Console
2. **Share API documentation** and endpoints
3. **Test with sample invoices** in staging
4. **Monitor first 100 jobs** for issues
5. **Set up billing/usage tracking**

### **When to Escalate Technical Issues**
- **Success rate drops** below 80%
- **Processing time increases** above 3 minutes
- **Multiple customer complaints** about accuracy
- **AWS cost spikes** beyond $0.30/invoice
- **API error rate** above 5%

---

*This guide serves as your comprehensive reference for understanding and managing the CIRA Invoice Processing System. For technical details, refer to the engineering documentation in `/docs/`. For operational issues, consult the monitoring dashboards and CloudWatch logs.*