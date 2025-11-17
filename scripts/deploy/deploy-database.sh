#!/bin/bash

# ============================================
# CIRA Invoice AWS - Database Stack Deployment
# ============================================
# This script deploys the database stack (RDS + VPC + Security Groups)
# and runs database migrations

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
STACK_NAME="CiraInvoice-Database-${ENVIRONMENT}"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Database Stack Deployment${NC}"
echo -e "${BLUE}  Environment: ${ENVIRONMENT}${NC}"
echo -e "${BLUE}  Stack: ${STACK_NAME}${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ============================================
# Check if using external database
# ============================================
if [ "$USE_EXTERNAL_DATABASE" = "true" ]; then
    echo -e "${YELLOW}⚠ USE_EXTERNAL_DATABASE=true${NC}"
    echo -e "Skipping RDS deployment (using external database)"
    echo ""
    exit 0
fi

# ============================================
# Build Infrastructure Package
# ============================================
echo -e "${BLUE}[1/5]${NC} Building infrastructure package..."
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
# Check if stack already exists
# ============================================
echo -e "${BLUE}[2/5]${NC} Checking stack status..."

STACK_EXISTS=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    2>/dev/null || echo "")

if [ -n "$STACK_EXISTS" ]; then
    STACK_STATUS=$(echo "$STACK_EXISTS" | jq -r '.Stacks[0].StackStatus')
    echo -e "${YELLOW}⚠${NC} Stack already exists with status: $STACK_STATUS"

    if [[ "$STACK_STATUS" == *"IN_PROGRESS"* ]]; then
        echo -e "${RED}✗${NC} Stack operation already in progress. Wait for it to complete."
        exit 1
    elif [[ "$STACK_STATUS" == *"FAILED"* ]] || [[ "$STACK_STATUS" == *"ROLLBACK"* ]]; then
        echo -e "${YELLOW}⚠${NC} Stack is in failed state. Consider manual cleanup."
        read -p "Do you want to continue? (yes/no): " CONTINUE
        if [ "$CONTINUE" != "yes" ]; then
            exit 1
        fi
    fi

    echo -e "${BLUE}ℹ${NC} Deploying stack update..."
else
    echo -e "${BLUE}ℹ${NC} Stack does not exist. Deploying new stack..."
fi

echo ""

# ============================================
# Deploy Database Stack with CDK
# ============================================
echo -e "${BLUE}[3/5]${NC} Deploying database stack..."

cd packages/infrastructure

# Deploy the stack
if cdk deploy "$STACK_NAME" \
    --context environment="$ENVIRONMENT" \
    --require-approval never \
    --region "$AWS_REGION" \
    --outputs-file "../../outputs-database-${ENVIRONMENT}.json"; then
    echo -e "${GREEN}✓${NC} Database stack deployment completed"
else
    echo -e "${RED}✗${NC} Database stack deployment failed"
    cd ../..
    exit 1
fi

cd ../..
echo ""

# ============================================
# Wait for Stack to be Ready
# ============================================
echo -e "${BLUE}[4/5]${NC} Waiting for stack to be ready..."

echo "This may take several minutes for RDS instance creation..."

aws cloudformation wait stack-create-complete \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" 2>/dev/null || \
aws cloudformation wait stack-update-complete \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" 2>/dev/null || true

echo -e "${GREEN}✓${NC} Stack is ready"
echo ""

# ============================================
# Run Database Migration
# ============================================
echo -e "${BLUE}[5/5]${NC} Running database migrations..."

if [ -f "packages/infrastructure/scripts/migrate.sh" ]; then
    if bash packages/infrastructure/scripts/migrate.sh "$ENVIRONMENT"; then
        echo -e "${GREEN}✓${NC} Database migration completed"
    else
        echo -e "${RED}✗${NC} Database migration failed"
        echo -e "${YELLOW}⚠${NC} Stack was deployed but migration failed"
        echo -e "You may need to run migrations manually:"
        echo -e "  cd packages/infrastructure && ./scripts/migrate.sh ${ENVIRONMENT}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠${NC} Migration script not found"
    echo -e "Skipping migration"
fi

echo ""

# ============================================
# Retrieve Database Connection Details
# ============================================
echo -e "${BLUE}[6/6]${NC} Retrieving database connection details..."

if [ -f "outputs-database-${ENVIRONMENT}.json" ]; then
    DB_SECRET_ARN=$(cat "outputs-database-${ENVIRONMENT}.json" | jq -r ".[\"$STACK_NAME\"].DatabaseSecretArn // empty")
    DB_PROXY_ENDPOINT=$(cat "outputs-database-${ENVIRONMENT}.json" | jq -r ".[\"$STACK_NAME\"].DatabaseProxyEndpoint // empty")

    if [ -n "$DB_SECRET_ARN" ]; then
        echo -e "${GREEN}✓${NC} Database Secret ARN: $DB_SECRET_ARN"
    fi

    if [ -n "$DB_PROXY_ENDPOINT" ]; then
        echo -e "${GREEN}✓${NC} Database Proxy Endpoint: $DB_PROXY_ENDPOINT"
    fi
else
    echo -e "${YELLOW}⚠${NC} Could not find outputs file"
fi

echo ""

# ============================================
# Summary
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Database deployment completed successfully!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Next steps:"
echo "1. Deploy application stack: ./scripts/deploy/deploy-application.sh ${ENVIRONMENT}"
echo "2. Verify deployment: ./scripts/deploy/verify-deployment.sh ${ENVIRONMENT}"
echo ""
