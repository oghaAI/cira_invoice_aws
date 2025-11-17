#!/bin/bash

# ============================================
# CIRA Invoice AWS - Health Check
# ============================================
# Quick health verification after deployment

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Environment (dev, staging, prod)
ENVIRONMENT=${1:-dev}
AWS_REGION=${AWS_REGION:-us-east-1}

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Health Check - ${ENVIRONMENT}${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

ERRORS=0
WARNINGS=0

# ============================================
# Helper Functions
# ============================================

print_check() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
    ((ERRORS++))
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
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

# ============================================
# Check 1: API Gateway Health
# ============================================
echo -e "${BLUE}[1/5]${NC} Checking API Gateway..."

if [ -z "$API_ENDPOINT" ]; then
    print_error "API_ENDPOINT not found in configuration"
else
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${API_ENDPOINT}/" || echo "000")

    if [ "$HTTP_CODE" = "200" ]; then
        print_check "API Gateway is healthy (HTTP $HTTP_CODE)"

        # Get the response
        RESPONSE=$(curl -s "${API_ENDPOINT}/" || echo "{}")
        if echo "$RESPONSE" | jq -e '.status == "healthy"' > /dev/null 2>&1; then
            print_check "API health endpoint returned healthy status"
        else
            print_warning "API health endpoint returned unexpected response"
        fi
    else
        print_error "API Gateway returned HTTP $HTTP_CODE"
    fi
fi

echo ""

# ============================================
# Check 2: Lambda Functions
# ============================================
echo -e "${BLUE}[2/5]${NC} Checking Lambda functions..."

# Job Management Lambda
JOB_LAMBDA="CiraInvoice-JobManagement-${ENVIRONMENT}"
if aws lambda get-function --function-name "$JOB_LAMBDA" --region "$AWS_REGION" &> /dev/null; then
    LAST_MODIFIED=$(aws lambda get-function --function-name "$JOB_LAMBDA" --region "$AWS_REGION" | jq -r '.Configuration.LastModified')
    print_check "Job Management Lambda exists (Last modified: $LAST_MODIFIED)"
else
    print_error "Job Management Lambda not found"
fi

# OCR Processing Lambda
OCR_LAMBDA="CiraInvoice-OcrProcessing-${ENVIRONMENT}"
if aws lambda get-function --function-name "$OCR_LAMBDA" --region "$AWS_REGION" &> /dev/null; then
    print_check "OCR Processing Lambda exists"
else
    print_warning "OCR Processing Lambda not found (may not be deployed yet)"
fi

# LLM Extraction Lambda
LLM_LAMBDA="CiraInvoice-LlmExtraction-${ENVIRONMENT}"
if aws lambda get-function --function-name "$LLM_LAMBDA" --region "$AWS_REGION" &> /dev/null; then
    print_check "LLM Extraction Lambda exists"
else
    print_warning "LLM Extraction Lambda not found (may not be deployed yet)"
fi

echo ""

# ============================================
# Check 3: Step Functions State Machine
# ============================================
echo -e "${BLUE}[3/5]${NC} Checking Step Functions..."

if [ -z "$STATE_MACHINE_ARN" ]; then
    print_warning "State Machine ARN not found in configuration"
else
    if aws stepfunctions describe-state-machine --state-machine-arn "$STATE_MACHINE_ARN" --region "$AWS_REGION" &> /dev/null; then
        STATUS=$(aws stepfunctions describe-state-machine --state-machine-arn "$STATE_MACHINE_ARN" --region "$AWS_REGION" | jq -r '.status')
        print_check "State Machine exists (Status: $STATUS)"
    else
        print_error "State Machine not accessible"
    fi
fi

echo ""

# ============================================
# Check 4: Database Connectivity
# ============================================
echo -e "${BLUE}[4/5]${NC} Checking database connectivity..."

if [ "$USE_EXTERNAL_DATABASE" = "true" ]; then
    print_info "Using external database (Supabase)"

    if [ -n "$DATABASE_URL" ]; then
        print_check "Database URL is configured"
    else
        print_error "DATABASE_URL not set"
    fi
else
    print_info "Using AWS RDS"

    # Check RDS instance
    DB_STACK="CiraInvoice-Database-${ENVIRONMENT}"
    if aws cloudformation describe-stacks --stack-name "$DB_STACK" --region "$AWS_REGION" &> /dev/null; then
        STACK_STATUS=$(aws cloudformation describe-stacks --stack-name "$DB_STACK" --region "$AWS_REGION" | jq -r '.Stacks[0].StackStatus')

        if [[ "$STACK_STATUS" == "CREATE_COMPLETE" ]] || [[ "$STACK_STATUS" == "UPDATE_COMPLETE" ]]; then
            print_check "RDS stack is healthy (Status: $STACK_STATUS)"
        else
            print_warning "RDS stack status: $STACK_STATUS"
        fi
    else
        print_error "RDS stack not found"
    fi
fi

echo ""

# ============================================
# Check 5: CloudWatch Logs
# ============================================
echo -e "${BLUE}[5/5]${NC} Checking CloudWatch logs..."

# Check if log groups exist
LOG_GROUP="/aws/lambda/${JOB_LAMBDA}"
if aws logs describe-log-groups --log-group-name-prefix "$LOG_GROUP" --region "$AWS_REGION" | jq -e '.logGroups | length > 0' > /dev/null 2>&1; then
    print_check "CloudWatch log group exists"

    # Check for recent logs
    RECENT_LOGS=$(aws logs describe-log-streams \
        --log-group-name "$LOG_GROUP" \
        --region "$AWS_REGION" \
        --order-by LastEventTime \
        --descending \
        --max-items 1 2>/dev/null || echo "{}")

    if echo "$RECENT_LOGS" | jq -e '.logStreams | length > 0' > /dev/null 2>&1; then
        LAST_EVENT=$(echo "$RECENT_LOGS" | jq -r '.logStreams[0].lastEventTimestamp')
        if [ "$LAST_EVENT" != "null" ]; then
            LAST_EVENT_DATE=$(date -r $(($LAST_EVENT / 1000)) 2>/dev/null || echo "Unknown")
            print_check "Recent logs found (Last event: $LAST_EVENT_DATE)"
        fi
    fi
else
    print_warning "CloudWatch log group not found yet"
fi

echo ""

# ============================================
# Summary
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Health Check Summary${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All health checks passed!${NC}"
    echo "Deployment is healthy and ready to use"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ Health check passed with ${WARNINGS} warning(s)${NC}"
    echo "Deployment is functional but review the warnings above"
    exit 0
else
    echo -e "${RED}✗ Health check failed with ${ERRORS} error(s) and ${WARNINGS} warning(s)${NC}"
    echo "Some services are not healthy"
    exit 1
fi
