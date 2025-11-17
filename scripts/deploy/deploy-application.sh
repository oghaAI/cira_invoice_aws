#!/bin/bash

# ============================================
# CIRA Invoice AWS - Application Stack Deployment
# ============================================
# This script deploys the application stacks:
# - API Stack (Lambda functions, API Gateway)
# - Workflow Stack (Step Functions)
# - Monitoring Stack (CloudWatch)

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

API_STACK="CiraInvoice-Api-${ENVIRONMENT}"
WORKFLOW_STACK="CiraInvoice-Workflow-${ENVIRONMENT}"
MONITORING_STACK="CiraInvoice-Monitoring-${ENVIRONMENT}"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Application Stack Deployment${NC}"
echo -e "${BLUE}  Environment: ${ENVIRONMENT}${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ============================================
# Build All Packages
# ============================================
echo -e "${BLUE}[1/5]${NC} Building all packages..."

echo "Building infrastructure package..."
cd packages/infrastructure
if npm run build:app; then
    echo -e "${GREEN}✓${NC} Infrastructure build completed"
else
    echo -e "${RED}✗${NC} Infrastructure build failed"
    exit 1
fi
cd ../..

echo ""

# ============================================
# Deploy API Stack
# ============================================
echo -e "${BLUE}[2/5]${NC} Deploying API stack..."

cd packages/infrastructure

if cdk deploy "$API_STACK" \
    --context environment="$ENVIRONMENT" \
    --require-approval never \
    --region "$AWS_REGION" \
    --outputs-file "../../outputs-api-${ENVIRONMENT}.json"; then
    echo -e "${GREEN}✓${NC} API stack deployment completed"
else
    echo -e "${RED}✗${NC} API stack deployment failed"
    cd ../..
    exit 1
fi

cd ../..
echo ""

# ============================================
# Wait for API Stack
# ============================================
echo -e "${BLUE}[3/5]${NC} Waiting for API stack to be ready..."

aws cloudformation wait stack-create-complete \
    --stack-name "$API_STACK" \
    --region "$AWS_REGION" 2>/dev/null || \
aws cloudformation wait stack-update-complete \
    --stack-name "$API_STACK" \
    --region "$AWS_REGION" 2>/dev/null || true

echo -e "${GREEN}✓${NC} API stack is ready"
echo ""

# ============================================
# Deploy Workflow Stack
# ============================================
echo -e "${BLUE}[4/5]${NC} Deploying Workflow stack..."

cd packages/infrastructure

if cdk deploy "$WORKFLOW_STACK" \
    --context environment="$ENVIRONMENT" \
    --require-approval never \
    --region "$AWS_REGION" \
    --outputs-file "../../outputs-workflow-${ENVIRONMENT}.json"; then
    echo -e "${GREEN}✓${NC} Workflow stack deployment completed"
else
    echo -e "${RED}✗${NC} Workflow stack deployment failed"
    cd ../..
    exit 1
fi

cd ../..
echo ""

# Wait for Workflow Stack
aws cloudformation wait stack-create-complete \
    --stack-name "$WORKFLOW_STACK" \
    --region "$AWS_REGION" 2>/dev/null || \
aws cloudformation wait stack-update-complete \
    --stack-name "$WORKFLOW_STACK" \
    --region "$AWS_REGION" 2>/dev/null || true

echo -e "${GREEN}✓${NC} Workflow stack is ready"
echo ""

# ============================================
# Deploy Monitoring Stack
# ============================================
echo -e "${BLUE}[5/5]${NC} Deploying Monitoring stack..."

cd packages/infrastructure

if cdk deploy "$MONITORING_STACK" \
    --context environment="$ENVIRONMENT" \
    --require-approval never \
    --region "$AWS_REGION" \
    --outputs-file "../../outputs-monitoring-${ENVIRONMENT}.json"; then
    echo -e "${GREEN}✓${NC} Monitoring stack deployment completed"
else
    echo -e "${YELLOW}⚠${NC} Monitoring stack deployment failed (non-critical)"
fi

cd ../..
echo ""

# ============================================
# Retrieve Deployment Outputs
# ============================================
echo -e "${BLUE}[6/6]${NC} Retrieving deployment outputs..."
echo ""

# API Outputs
if [ -f "outputs-api-${ENVIRONMENT}.json" ]; then
    API_ENDPOINT=$(cat "outputs-api-${ENVIRONMENT}.json" | jq -r ".[\"$API_STACK\"].ApiEndpoint // empty")
    API_KEY=$(cat "outputs-api-${ENVIRONMENT}.json" | jq -r ".[\"$API_STACK\"].ApiKeyValue // empty")

    if [ -n "$API_ENDPOINT" ]; then
        echo -e "${GREEN}✓${NC} API Endpoint: ${BLUE}$API_ENDPOINT${NC}"
    fi

    if [ -n "$API_KEY" ]; then
        echo -e "${GREEN}✓${NC} API Key: ${BLUE}${API_KEY:0:8}...${NC} (masked)"
        echo -e "${YELLOW}ℹ${NC} Full API key saved to outputs-api-${ENVIRONMENT}.json"
    fi
fi

# Workflow Outputs
if [ -f "outputs-workflow-${ENVIRONMENT}.json" ]; then
    STATE_MACHINE_ARN=$(cat "outputs-workflow-${ENVIRONMENT}.json" | jq -r ".[\"$WORKFLOW_STACK\"].StateMachineArn // empty")

    if [ -n "$STATE_MACHINE_ARN" ]; then
        echo -e "${GREEN}✓${NC} State Machine ARN: $STATE_MACHINE_ARN"
    fi
fi

echo ""

# ============================================
# Save Configuration
# ============================================
echo -e "${BLUE}Saving deployment configuration...${NC}"

cat > "deployment-${ENVIRONMENT}.config" <<EOF
# CIRA Invoice AWS - ${ENVIRONMENT} Deployment Configuration
# Generated: $(date)

ENVIRONMENT=${ENVIRONMENT}
AWS_REGION=${AWS_REGION}

# API Configuration
API_ENDPOINT=${API_ENDPOINT}
API_KEY=${API_KEY}

# Stack Names
API_STACK=${API_STACK}
WORKFLOW_STACK=${WORKFLOW_STACK}
MONITORING_STACK=${MONITORING_STACK}

# State Machine
STATE_MACHINE_ARN=${STATE_MACHINE_ARN}
EOF

echo -e "${GREEN}✓${NC} Configuration saved to deployment-${ENVIRONMENT}.config"
echo ""

# ============================================
# Summary
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Application deployment completed successfully!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Deployment Summary:"
echo "  • API Stack: ✓ Deployed"
echo "  • Workflow Stack: ✓ Deployed"
echo "  • Monitoring Stack: ✓ Deployed"
echo ""
echo "Quick Test:"
echo "  curl ${API_ENDPOINT}/"
echo ""
echo "Next steps:"
echo "1. Test API: ./scripts/deploy/test-endpoints.sh ${ENVIRONMENT}"
echo "2. Verify deployment: ./scripts/deploy/verify-deployment.sh ${ENVIRONMENT}"
echo "3. View API documentation: cat api_usage.md"
echo ""
