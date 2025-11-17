#!/bin/bash

# ============================================
# CIRA Invoice AWS - Main Deployment Orchestrator
# ============================================
# This script orchestrates the complete deployment process:
# 1. Validate AWS setup and prerequisites
# 2. Deploy database stack (if using RDS)
# 3. Deploy application stacks (API, Workflow, Monitoring)
# 4. Verify deployment

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
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Change to project root
cd "$PROJECT_ROOT"

# ============================================
# Parse Arguments
# ============================================
ENVIRONMENT=${1:-dev}
SKIP_VALIDATION=${2:-false}

# Supported environments
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
    echo -e "${RED}Error: Invalid environment '$ENVIRONMENT'${NC}"
    echo "Usage: $0 <environment> [--skip-validation]"
    echo "  environment: dev, staging, or prod"
    echo "  --skip-validation: Skip pre-deployment validation (not recommended)"
    exit 1
fi

if [ "$2" = "--skip-validation" ]; then
    SKIP_VALIDATION=true
fi

# ============================================
# Banner
# ============================================
clear
echo -e "${BLUE}${BOLD}"
echo "╔════════════════════════════════════════════╗"
echo "║                                            ║"
echo "║     CIRA Invoice AWS Deployment            ║"
echo "║                                            ║"
echo "╚════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "${BLUE}Environment:${NC} ${BOLD}${ENVIRONMENT}${NC}"
echo -e "${BLUE}Region:${NC} ${AWS_REGION:-us-east-1}"
echo -e "${BLUE}Timestamp:${NC} $(date)"
echo ""

# Confirmation for production
if [ "$ENVIRONMENT" = "prod" ]; then
    echo -e "${RED}${BOLD}⚠  WARNING: You are deploying to PRODUCTION${NC}"
    echo ""
    read -p "Are you sure you want to continue? Type 'yes' to confirm: " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
        echo "Deployment cancelled"
        exit 0
    fi
    echo ""
fi

# ============================================
# Load Environment Variables
# ============================================
echo -e "${BLUE}[0/5]${NC} Loading environment configuration..."

if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
    echo -e "${GREEN}✓${NC} Loaded .env file"
elif [ -f ".env.${ENVIRONMENT}" ]; then
    export $(cat ".env.${ENVIRONMENT}" | grep -v '^#' | xargs)
    echo -e "${GREEN}✓${NC} Loaded .env.${ENVIRONMENT} file"
else
    echo -e "${YELLOW}⚠${NC} No .env file found, using environment variables"
fi

echo ""

# ============================================
# Step 1: Validate AWS Setup
# ============================================
if [ "$SKIP_VALIDATION" = true ]; then
    echo -e "${YELLOW}⚠ Skipping validation (--skip-validation flag)${NC}"
    echo ""
else
    echo -e "${BLUE}${BOLD}[1/5] Validating AWS Setup${NC}"
    echo ""

    if bash "$SCRIPT_DIR/validate-aws-setup.sh" "$ENVIRONMENT"; then
        echo -e "${GREEN}✓ Validation passed${NC}"
    else
        echo -e "${RED}✗ Validation failed${NC}"
        echo ""
        echo "Fix the errors above and try again"
        echo "Or run with --skip-validation to bypass (not recommended)"
        exit 1
    fi
    echo ""
fi

# ============================================
# Step 2: Deploy Database Stack
# ============================================
echo -e "${BLUE}${BOLD}[2/5] Deploying Database Stack${NC}"
echo ""

if [ "$USE_EXTERNAL_DATABASE" = "true" ]; then
    echo -e "${YELLOW}⚠ Using external database (Supabase)${NC}"
    echo -e "Skipping RDS deployment"
else
    if bash "$SCRIPT_DIR/deploy-database.sh" "$ENVIRONMENT"; then
        echo -e "${GREEN}✓ Database deployment completed${NC}"
    else
        echo -e "${RED}✗ Database deployment failed${NC}"
        exit 1
    fi
fi

echo ""

# ============================================
# Step 3: Deploy Application Stacks
# ============================================
echo -e "${BLUE}${BOLD}[3/5] Deploying Application Stacks${NC}"
echo ""

if bash "$SCRIPT_DIR/deploy-application.sh" "$ENVIRONMENT"; then
    echo -e "${GREEN}✓ Application deployment completed${NC}"
else
    echo -e "${RED}✗ Application deployment failed${NC}"
    exit 1
fi

echo ""

# ============================================
# Step 4: Health Check
# ============================================
echo -e "${BLUE}${BOLD}[4/5] Running Health Checks${NC}"
echo ""

if [ -f "$SCRIPT_DIR/health-check.sh" ]; then
    if bash "$SCRIPT_DIR/health-check.sh" "$ENVIRONMENT"; then
        echo -e "${GREEN}✓ Health checks passed${NC}"
    else
        echo -e "${YELLOW}⚠ Some health checks failed${NC}"
        echo -e "The deployment was successful but some services may not be healthy yet"
    fi
else
    echo -e "${YELLOW}⚠ Health check script not found, skipping${NC}"
fi

echo ""

# ============================================
# Step 5: Deployment Summary
# ============================================
echo -e "${BLUE}${BOLD}[5/5] Deployment Summary${NC}"
echo ""

# Load deployment config
if [ -f "deployment-${ENVIRONMENT}.config" ]; then
    source "deployment-${ENVIRONMENT}.config"

    echo -e "${GREEN}✓ Deployment completed successfully!${NC}"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${BOLD}Deployment Information${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo -e "${BLUE}Environment:${NC} $ENVIRONMENT"
    echo -e "${BLUE}Region:${NC} $AWS_REGION"
    echo ""
    echo -e "${BLUE}API Endpoint:${NC}"
    echo "  $API_ENDPOINT"
    echo ""
    echo -e "${BLUE}API Key:${NC}"
    echo "  ${API_KEY:0:10}...${API_KEY: -10} (masked)"
    echo ""
    echo -e "${YELLOW}ℹ Full configuration saved to: deployment-${ENVIRONMENT}.config${NC}"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${BOLD}Quick Test${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Test health endpoint:"
    echo "  curl ${API_ENDPOINT}/"
    echo ""
    echo "Submit a test job:"
    echo "  curl -X POST ${API_ENDPOINT}/jobs \\"
    echo "    -H 'Content-Type: application/json' \\"
    echo "    -H 'X-API-Key: ${API_KEY}' \\"
    echo "    -d '{\"pdf_url\": \"https://example.com/invoice.pdf\"}'"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${BOLD}Next Steps${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "1. Verify deployment:"
    echo "   ./scripts/deploy/verify-deployment.sh ${ENVIRONMENT}"
    echo ""
    echo "2. Test all endpoints:"
    echo "   ./scripts/deploy/test-endpoints.sh ${ENVIRONMENT}"
    echo ""
    echo "3. View API documentation:"
    echo "   cat api_usage.md"
    echo ""
    echo "4. Monitor logs:"
    echo "   aws logs tail /aws/lambda/CiraInvoice-${ENVIRONMENT} --follow"
    echo ""
else
    echo -e "${YELLOW}⚠ Could not find deployment configuration${NC}"
fi

# ============================================
# Deployment Log
# ============================================
DEPLOYMENT_LOG="deployments.log"
echo "[$(date)] Deployed ${ENVIRONMENT} successfully" >> "$DEPLOYMENT_LOG"

# ============================================
# Final Message
# ============================================
echo -e "${GREEN}${BOLD}"
echo "╔════════════════════════════════════════════╗"
echo "║                                            ║"
echo "║     Deployment Completed Successfully!     ║"
echo "║                                            ║"
echo "╚════════════════════════════════════════════╝"
echo -e "${NC}"

exit 0
