#!/bin/bash

# ============================================
# CIRA Invoice AWS - API Endpoint Testing
# ============================================
# Test all API endpoints with sample data

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Environment (dev, staging, prod)
ENVIRONMENT=${1:-dev}

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  API Endpoint Testing - ${ENVIRONMENT}${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

PASSED=0
FAILED=0

# ============================================
# Helper Functions
# ============================================

print_check() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
}

print_error() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# ============================================
# Load Deployment Configuration
# ============================================
if [ -f "deployment-${ENVIRONMENT}.config" ]; then
    source "deployment-${ENVIRONMENT}.config"
    print_check "Loaded deployment configuration"
else
    print_error "Deployment configuration not found"
    echo "Run deployment first: ./scripts/deploy/deploy.sh ${ENVIRONMENT}"
    exit 1
fi

echo ""

if [ -z "$API_ENDPOINT" ] || [ -z "$API_KEY" ]; then
    print_error "API_ENDPOINT or API_KEY not found in configuration"
    exit 1
fi

# ============================================
# Test 1: Health Check Endpoint
# ============================================
echo -e "${BLUE}[1/5]${NC} Testing health check endpoint..."
echo "GET ${API_ENDPOINT}/"

RESPONSE=$(curl -s -w "\n%{http_code}" "${API_ENDPOINT}/" || echo "000")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    print_check "Health check returned HTTP 200"

    if echo "$BODY" | jq -e '.status == "healthy"' > /dev/null 2>&1; then
        print_check "Response contains healthy status"
    else
        print_error "Response does not contain expected health status"
    fi

    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
else
    print_error "Health check failed with HTTP $HTTP_CODE"
    echo "$BODY"
fi

echo ""

# ============================================
# Test 2: Create Job (Invalid Request)
# ============================================
echo -e "${BLUE}[2/5]${NC} Testing create job with invalid data..."
echo "POST ${API_ENDPOINT}/jobs (missing pdf_url)"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_ENDPOINT}/jobs" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: ${API_KEY}" \
    -d '{}' || echo "000")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "400" ]; then
    print_check "Correctly rejected invalid request with HTTP 400"
else
    print_error "Expected HTTP 400, got HTTP $HTTP_CODE"
fi

echo ""

# ============================================
# Test 3: Create Job (Valid Request)
# ============================================
echo -e "${BLUE}[3/5]${NC} Testing create job with valid data..."

# Use a sample PDF URL (you may want to replace this with a real one)
SAMPLE_PDF_URL="https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"

echo "POST ${API_ENDPOINT}/jobs"
print_info "PDF URL: $SAMPLE_PDF_URL"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_ENDPOINT}/jobs" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: ${API_KEY}" \
    -d "{\"pdf_url\": \"${SAMPLE_PDF_URL}\"}" || echo "000")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "201" ]; then
    print_check "Job created successfully (HTTP 201)"

    JOB_ID=$(echo "$BODY" | jq -r '.job_id // empty')
    if [ -n "$JOB_ID" ]; then
        print_check "Job ID received: $JOB_ID"
        echo "$BODY" | jq '.'
    else
        print_error "No job_id in response"
        echo "$BODY"
    fi
else
    print_error "Job creation failed with HTTP $HTTP_CODE"
    echo "$BODY"
fi

echo ""

# ============================================
# Test 4: Get Job Status
# ============================================
if [ -n "$JOB_ID" ]; then
    echo -e "${BLUE}[4/5]${NC} Testing get job status..."
    echo "GET ${API_ENDPOINT}/jobs/${JOB_ID}/status"

    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "${API_ENDPOINT}/jobs/${JOB_ID}/status" \
        -H "X-API-Key: ${API_KEY}" || echo "000")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" = "200" ]; then
        print_check "Job status retrieved (HTTP 200)"

        STATUS=$(echo "$BODY" | jq -r '.status // empty')
        if [ -n "$STATUS" ]; then
            print_check "Job status: $STATUS"
            echo "$BODY" | jq '.'
        else
            print_error "No status in response"
            echo "$BODY"
        fi
    else
        print_error "Get job status failed with HTTP $HTTP_CODE"
        echo "$BODY"
    fi
else
    echo -e "${YELLOW}⚠${NC} Skipping job status test (no job ID)"
fi

echo ""

# ============================================
# Test 5: Get Job Details
# ============================================
if [ -n "$JOB_ID" ]; then
    echo -e "${BLUE}[5/5]${NC} Testing get job details..."
    echo "GET ${API_ENDPOINT}/jobs/${JOB_ID}"

    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "${API_ENDPOINT}/jobs/${JOB_ID}" \
        -H "X-API-Key: ${API_KEY}" || echo "000")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" = "200" ]; then
        print_check "Job details retrieved (HTTP 200)"
        echo "$BODY" | jq '.'
    else
        print_error "Get job details failed with HTTP $HTTP_CODE"
        echo "$BODY"
    fi
else
    echo -e "${YELLOW}⚠${NC} Skipping job details test (no job ID)"
fi

echo ""

# ============================================
# Additional Tests (Optional)
# ============================================
if [ -n "$JOB_ID" ]; then
    echo -e "${BLUE}[Bonus]${NC} Testing authentication..."

    # Test without API key
    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "${API_ENDPOINT}/jobs/${JOB_ID}" || echo "000")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

    if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
        print_check "API correctly requires authentication (HTTP $HTTP_CODE)"
    else
        print_error "Expected HTTP 401/403 without API key, got HTTP $HTTP_CODE"
    fi

    # Test with invalid API key
    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "${API_ENDPOINT}/jobs/${JOB_ID}" \
        -H "X-API-Key: invalid-key-12345" || echo "000")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

    if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
        print_check "API correctly rejects invalid API key (HTTP $HTTP_CODE)"
    else
        print_error "Expected HTTP 401/403 with invalid API key, got HTTP $HTTP_CODE"
    fi
fi

echo ""

# ============================================
# Summary
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Test Summary${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

TOTAL=$((PASSED + FAILED))
echo "Total Tests: $TOTAL"
echo -e "${GREEN}Passed: $PASSED${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Failed: $FAILED${NC}"
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
