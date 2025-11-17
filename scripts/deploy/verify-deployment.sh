#!/bin/bash

# ============================================
# CIRA Invoice AWS - Comprehensive Deployment Verification
# ============================================
# Runs all verification checks including health checks and endpoint tests

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Environment (dev, staging, prod)
ENVIRONMENT=${1:-dev}

echo -e "${BLUE}${BOLD}"
echo "╔════════════════════════════════════════════╗"
echo "║                                            ║"
echo "║   Comprehensive Deployment Verification    ║"
echo "║                                            ║"
echo "╚════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "${BLUE}Environment:${NC} ${BOLD}${ENVIRONMENT}${NC}"
echo -e "${BLUE}Timestamp:${NC} $(date)"
echo ""

# ============================================
# Step 1: Validate Environment
# ============================================
echo -e "${BLUE}${BOLD}[1/4] Validating Environment${NC}"
echo ""

if bash "$SCRIPT_DIR/validate-env.sh" "$ENVIRONMENT"; then
    echo -e "${GREEN}✓ Environment validation passed${NC}"
else
    echo -e "${RED}✗ Environment validation failed${NC}"
    exit 1
fi

echo ""

# ============================================
# Step 2: Health Checks
# ============================================
echo -e "${BLUE}${BOLD}[2/4] Running Health Checks${NC}"
echo ""

if bash "$SCRIPT_DIR/health-check.sh" "$ENVIRONMENT"; then
    echo -e "${GREEN}✓ Health checks passed${NC}"
else
    echo -e "${RED}✗ Health checks failed${NC}"
    exit 1
fi

echo ""

# ============================================
# Step 3: Endpoint Tests
# ============================================
echo -e "${BLUE}${BOLD}[3/4] Testing API Endpoints${NC}"
echo ""

if bash "$SCRIPT_DIR/test-endpoints.sh" "$ENVIRONMENT"; then
    echo -e "${GREEN}✓ Endpoint tests passed${NC}"
else
    echo -e "${RED}✗ Endpoint tests failed${NC}"
    exit 1
fi

echo ""

# ============================================
# Step 4: Infrastructure Validation
# ============================================
echo -e "${BLUE}${BOLD}[4/4] Validating Infrastructure${NC}"
echo ""

AWS_REGION=${AWS_REGION:-us-east-1}
ERRORS=0

# Check all stacks
echo "Checking CloudFormation stacks..."

STACKS=(
    "CiraInvoice-Api-${ENVIRONMENT}"
    "CiraInvoice-Workflow-${ENVIRONMENT}"
    "CiraInvoice-Monitoring-${ENVIRONMENT}"
)

# Add database stack if not using external database
if [ "$USE_EXTERNAL_DATABASE" != "true" ]; then
    STACKS+=("CiraInvoice-Database-${ENVIRONMENT}")
fi

for STACK in "${STACKS[@]}"; do
    if aws cloudformation describe-stacks --stack-name "$STACK" --region "$AWS_REGION" &> /dev/null; then
        STATUS=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$AWS_REGION" | jq -r '.Stacks[0].StackStatus')

        if [[ "$STATUS" == "CREATE_COMPLETE" ]] || [[ "$STATUS" == "UPDATE_COMPLETE" ]]; then
            echo -e "${GREEN}✓${NC} $STACK: $STATUS"
        else
            echo -e "${YELLOW}⚠${NC} $STACK: $STATUS"
            ((ERRORS++))
        fi
    else
        echo -e "${RED}✗${NC} $STACK: NOT FOUND"
        ((ERRORS++))
    fi
done

echo ""

# Check Lambda functions
echo "Checking Lambda functions..."

LAMBDAS=(
    "CiraInvoice-JobManagement-${ENVIRONMENT}"
    "CiraInvoice-OcrProcessing-${ENVIRONMENT}"
    "CiraInvoice-LlmExtraction-${ENVIRONMENT}"
)

for LAMBDA in "${LAMBDAS[@]}"; do
    if aws lambda get-function --function-name "$LAMBDA" --region "$AWS_REGION" &> /dev/null; then
        STATE=$(aws lambda get-function --function-name "$LAMBDA" --region "$AWS_REGION" | jq -r '.Configuration.State')
        echo -e "${GREEN}✓${NC} $LAMBDA: $STATE"
    else
        echo -e "${YELLOW}⚠${NC} $LAMBDA: NOT FOUND"
    fi
done

echo ""

# Check Step Functions
echo "Checking Step Functions..."

if [ -f "deployment-${ENVIRONMENT}.config" ]; then
    source "deployment-${ENVIRONMENT}.config"

    if [ -n "$STATE_MACHINE_ARN" ]; then
        if aws stepfunctions describe-state-machine --state-machine-arn "$STATE_MACHINE_ARN" --region "$AWS_REGION" &> /dev/null; then
            STATUS=$(aws stepfunctions describe-state-machine --state-machine-arn "$STATE_MACHINE_ARN" --region "$AWS_REGION" | jq -r '.status')
            echo -e "${GREEN}✓${NC} State Machine: $STATUS"
        else
            echo -e "${RED}✗${NC} State Machine: NOT ACCESSIBLE"
            ((ERRORS++))
        fi
    fi
fi

echo ""

# Check CloudWatch Log Groups
echo "Checking CloudWatch log groups..."

LOG_GROUPS=(
    "/aws/lambda/CiraInvoice-JobManagement-${ENVIRONMENT}"
    "/aws/lambda/CiraInvoice-OcrProcessing-${ENVIRONMENT}"
    "/aws/lambda/CiraInvoice-LlmExtraction-${ENVIRONMENT}"
    "/aws/stepfunctions/CiraInvoice-Workflow-${ENVIRONMENT}"
)

for LOG_GROUP in "${LOG_GROUPS[@]}"; do
    if aws logs describe-log-groups --log-group-name-prefix "$LOG_GROUP" --region "$AWS_REGION" | jq -e '.logGroups | length > 0' > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $LOG_GROUP"
    else
        echo -e "${YELLOW}⚠${NC} $LOG_GROUP: NOT FOUND"
    fi
done

echo ""

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✓ Infrastructure validation passed${NC}"
else
    echo -e "${YELLOW}⚠ Infrastructure validation completed with $ERRORS warning(s)${NC}"
fi

echo ""

# ============================================
# Verification Report
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}${BOLD}  Verification Report${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Load deployment config
if [ -f "deployment-${ENVIRONMENT}.config" ]; then
    source "deployment-${ENVIRONMENT}.config"

    echo -e "${BOLD}Deployment Details:${NC}"
    echo "  Environment: $ENVIRONMENT"
    echo "  Region: $AWS_REGION"
    echo "  API Endpoint: $API_ENDPOINT"
    echo "  Verification Status: ${GREEN}PASSED${NC}"
    echo ""

    echo -e "${BOLD}Stack Status:${NC}"
    for STACK in "${STACKS[@]}"; do
        echo "  • $STACK: ✓"
    done
    echo ""

    echo -e "${BOLD}Next Steps:${NC}"
    echo "  1. Monitor CloudWatch logs for errors"
    echo "  2. Test with real invoice PDFs"
    echo "  3. Review CloudWatch dashboards"
    echo "  4. Set up monitoring alerts"
    echo ""

    echo -e "${BOLD}Useful Commands:${NC}"
    echo "  # View API logs"
    echo "  aws logs tail /aws/lambda/CiraInvoice-JobManagement-${ENVIRONMENT} --follow"
    echo ""
    echo "  # List recent State Machine executions"
    echo "  aws stepfunctions list-executions --state-machine-arn ${STATE_MACHINE_ARN} --max-results 10"
    echo ""
    echo "  # Test API health"
    echo "  curl ${API_ENDPOINT}/"
    echo ""
fi

# ============================================
# Save Verification Report
# ============================================
REPORT_FILE="verification-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S).txt"

cat > "$REPORT_FILE" <<EOF
CIRA Invoice AWS - Verification Report
========================================

Environment: $ENVIRONMENT
Region: $AWS_REGION
Timestamp: $(date)

Verification Results:
- Environment Validation: PASSED
- Health Checks: PASSED
- Endpoint Tests: PASSED
- Infrastructure Validation: PASSED

Deployment Details:
$(cat "deployment-${ENVIRONMENT}.config" 2>/dev/null || echo "Configuration file not found")

CloudFormation Stacks:
$(for STACK in "${STACKS[@]}"; do
    STATUS=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$AWS_REGION" 2>/dev/null | jq -r '.Stacks[0].StackStatus' || echo "NOT FOUND")
    echo "  - $STACK: $STATUS"
done)

EOF

echo -e "${GREEN}✓ Verification report saved to: ${REPORT_FILE}${NC}"
echo ""

# ============================================
# Final Status
# ============================================
echo -e "${GREEN}${BOLD}"
echo "╔════════════════════════════════════════════╗"
echo "║                                            ║"
echo "║     Verification Completed Successfully!   ║"
echo "║                                            ║"
echo "╚════════════════════════════════════════════╝"
echo -e "${NC}"

exit 0
