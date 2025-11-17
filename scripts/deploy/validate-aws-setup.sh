#!/bin/bash

# ============================================
# CIRA Invoice AWS - Pre-deployment Validation
# ============================================
# This script validates that the environment is ready for deployment
# - AWS credentials and configuration
# - CDK bootstrap status
# - Required tools and versions
# - Environment variables

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
echo -e "${BLUE}  CIRA Invoice AWS - Pre-deployment Validation${NC}"
echo -e "${BLUE}  Environment: ${ENVIRONMENT}${NC}"
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
# Check 1: Node.js and npm versions
# ============================================
echo -e "${BLUE}[1/8]${NC} Checking Node.js and npm versions..."

if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2)
    REQUIRED_NODE_VERSION="20.17.0"

    if [ "$(printf '%s\n' "$REQUIRED_NODE_VERSION" "$NODE_VERSION" | sort -V | head -n1)" = "$REQUIRED_NODE_VERSION" ]; then
        print_check "Node.js version: $NODE_VERSION (>= $REQUIRED_NODE_VERSION)"
    else
        print_error "Node.js version $NODE_VERSION is too old (required >= $REQUIRED_NODE_VERSION)"
    fi
else
    print_error "Node.js is not installed"
fi

if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    print_check "npm version: $NPM_VERSION"
else
    print_error "npm is not installed"
fi

echo ""

# ============================================
# Check 2: AWS CLI
# ============================================
echo -e "${BLUE}[2/8]${NC} Checking AWS CLI..."

if command -v aws &> /dev/null; then
    AWS_CLI_VERSION=$(aws --version 2>&1 | cut -d' ' -f1 | cut -d'/' -f2)
    print_check "AWS CLI installed: $AWS_CLI_VERSION"
else
    print_error "AWS CLI is not installed"
fi

echo ""

# ============================================
# Check 3: AWS Credentials
# ============================================
echo -e "${BLUE}[3/8]${NC} Checking AWS credentials..."

if aws sts get-caller-identity &> /dev/null; then
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    AWS_USER=$(aws sts get-caller-identity --query Arn --output text)
    print_check "AWS credentials configured"
    print_info "Account ID: $AWS_ACCOUNT_ID"
    print_info "User/Role: $AWS_USER"

    # Export for use in other scripts
    export CDK_DEFAULT_ACCOUNT=$AWS_ACCOUNT_ID
else
    print_error "AWS credentials not configured or invalid"
    print_info "Run: aws configure"
fi

echo ""

# ============================================
# Check 4: AWS CDK
# ============================================
echo -e "${BLUE}[4/8]${NC} Checking AWS CDK..."

if command -v cdk &> /dev/null; then
    CDK_VERSION=$(cdk --version 2>&1 | cut -d' ' -f1)
    print_check "AWS CDK installed: $CDK_VERSION"
else
    print_error "AWS CDK is not installed"
    print_info "Run: npm install -g aws-cdk"
fi

echo ""

# ============================================
# Check 5: CDK Bootstrap
# ============================================
echo -e "${BLUE}[5/8]${NC} Checking CDK bootstrap..."

AWS_REGION=${AWS_REGION:-us-east-1}

if aws cloudformation describe-stacks --stack-name CDKToolkit --region $AWS_REGION &> /dev/null; then
    print_check "CDK is bootstrapped in region $AWS_REGION"
else
    print_error "CDK is not bootstrapped in region $AWS_REGION"
    print_info "Run: cdk bootstrap aws://$AWS_ACCOUNT_ID/$AWS_REGION"
fi

echo ""

# ============================================
# Check 6: Required Environment Variables
# ============================================
echo -e "${BLUE}[6/8]${NC} Checking required environment variables..."

# Load .env file if it exists
if [ -f .env ]; then
    print_check ".env file found"
    export $(cat .env | grep -v '^#' | xargs)
else
    print_warning ".env file not found (will use environment variables)"
fi

# Check critical variables
REQUIRED_VARS=(
    "AZURE_OPENAI_API_KEY"
    "AZURE_OPENAI_ENDPOINT"
)

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        print_error "$var is not set"
    else
        # Mask the value for security
        masked_value="${!var:0:4}...${!var: -4}"
        print_check "$var is set ($masked_value)"
    fi
done

# Check database configuration
if [ -z "$USE_EXTERNAL_DATABASE" ]; then
    print_warning "USE_EXTERNAL_DATABASE is not set (will default based on environment)"
else
    print_check "USE_EXTERNAL_DATABASE: $USE_EXTERNAL_DATABASE"

    if [ "$USE_EXTERNAL_DATABASE" = "true" ]; then
        if [ -z "$DATABASE_URL" ]; then
            print_error "DATABASE_URL is required when USE_EXTERNAL_DATABASE=true"
        else
            print_check "DATABASE_URL is set"
        fi
    fi
fi

echo ""

# ============================================
# Check 7: Project Build Status
# ============================================
echo -e "${BLUE}[7/8]${NC} Checking project build..."

if [ -d "packages/infrastructure/lib" ]; then
    print_check "Infrastructure package appears to be built"
else
    print_warning "Infrastructure package may not be built"
    print_info "Run: cd packages/infrastructure && npm run build:app"
fi

if [ -d "packages/api/dist" ]; then
    print_check "API package appears to be built"
else
    print_warning "API package may not be built"
    print_info "Run: npm run build"
fi

echo ""

# ============================================
# Check 8: IAM Permissions (Basic Check)
# ============================================
echo -e "${BLUE}[8/8]${NC} Checking basic IAM permissions..."

# Test CloudFormation permissions
if aws cloudformation list-stacks --region $AWS_REGION --max-items 1 &> /dev/null; then
    print_check "CloudFormation permissions verified"
else
    print_error "Missing CloudFormation permissions"
fi

# Test Lambda permissions
if aws lambda list-functions --region $AWS_REGION --max-items 1 &> /dev/null; then
    print_check "Lambda permissions verified"
else
    print_error "Missing Lambda permissions"
fi

# Test RDS permissions (if not using external database)
if [ "$USE_EXTERNAL_DATABASE" != "true" ]; then
    if aws rds describe-db-instances --region $AWS_REGION --max-items 1 &> /dev/null; then
        print_check "RDS permissions verified"
    else
        print_error "Missing RDS permissions"
    fi
fi

echo ""

# ============================================
# Summary
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Validation Summary${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo -e "Environment is ready for deployment to ${ENVIRONMENT}"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ Validation passed with ${WARNINGS} warning(s)${NC}"
    echo -e "You can proceed with deployment, but review the warnings above"
    exit 0
else
    echo -e "${RED}✗ Validation failed with ${ERRORS} error(s) and ${WARNINGS} warning(s)${NC}"
    echo -e "Please fix the errors above before deploying"
    exit 1
fi
