#!/bin/bash

# ============================================
# CIRA Invoice AWS - Interactive Environment Setup
# ============================================
# This script guides you through setting up environment variables

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Clear screen
clear

echo -e "${BLUE}${BOLD}"
echo "╔════════════════════════════════════════════╗"
echo "║                                            ║"
echo "║   CIRA Invoice Environment Setup           ║"
echo "║                                            ║"
echo "╚════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

# ============================================
# Step 1: Select Environment
# ============================================
echo -e "${BLUE}${BOLD}Step 1: Select Environment${NC}"
echo ""
echo "Which environment would you like to configure?"
echo "  1) Development (Supabase)"
echo "  2) Staging (RDS)"
echo "  3) Production (RDS Multi-AZ)"
echo ""
read -p "Enter your choice (1-3): " ENV_CHOICE

case $ENV_CHOICE in
    1)
        ENVIRONMENT="dev"
        TEMPLATE=".env.dev.template"
        echo -e "${GREEN}✓ Selected: Development${NC}"
        ;;
    2)
        ENVIRONMENT="staging"
        TEMPLATE=".env.staging.template"
        echo -e "${GREEN}✓ Selected: Staging${NC}"
        ;;
    3)
        ENVIRONMENT="production"
        TEMPLATE=".env.production.template"
        echo -e "${YELLOW}⚠ Selected: Production (Use Secrets Manager for credentials!)${NC}"
        ;;
    *)
        echo -e "${RED}✗ Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""

# ============================================
# Step 2: Check if .env exists
# ============================================
if [ -f .env ]; then
    echo -e "${YELLOW}⚠ Warning: .env file already exists${NC}"
    read -p "Overwrite existing .env file? (yes/no): " OVERWRITE
    if [ "$OVERWRITE" != "yes" ]; then
        echo "Setup cancelled"
        exit 0
    fi
fi

# ============================================
# Step 3: AWS Configuration
# ============================================
echo -e "${BLUE}${BOLD}Step 2: AWS Configuration${NC}"
echo ""

# AWS Region
read -p "AWS Region [us-east-1]: " AWS_REGION
AWS_REGION=${AWS_REGION:-us-east-1}

# AWS Profile
read -p "AWS Profile [default]: " AWS_PROFILE
AWS_PROFILE=${AWS_PROFILE:-default}

# Try to get AWS account ID
AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")

if [ -n "$AWS_ACCOUNT" ]; then
    echo -e "${GREEN}✓ Detected AWS Account ID: $AWS_ACCOUNT${NC}"
    read -p "Use this account? (yes/no) [yes]: " USE_ACCOUNT
    USE_ACCOUNT=${USE_ACCOUNT:-yes}

    if [ "$USE_ACCOUNT" != "yes" ]; then
        read -p "Enter AWS Account ID: " AWS_ACCOUNT
    fi
else
    read -p "AWS Account ID: " AWS_ACCOUNT
fi

echo ""

# ============================================
# Step 4: Database Configuration
# ============================================
echo -e "${BLUE}${BOLD}Step 3: Database Configuration${NC}"
echo ""

if [ "$ENVIRONMENT" = "dev" ]; then
    echo "Development uses Supabase (external database)"
    USE_EXTERNAL_DATABASE="true"

    echo ""
    echo "You need your Supabase connection string."
    echo "Get it from: Supabase Dashboard > Settings > Database > Connection string"
    echo "Use the 'Connection pooling' URL (port 6543)"
    echo ""
    read -p "Supabase Connection URL: " DATABASE_URL

    if [ -z "$DATABASE_URL" ]; then
        echo -e "${RED}✗ Database URL is required${NC}"
        exit 1
    fi
else
    echo "$ENVIRONMENT uses AWS RDS"
    USE_EXTERNAL_DATABASE="false"
    DATABASE_URL=""

    # RDS Configuration
    if [ "$ENVIRONMENT" = "staging" ]; then
        DB_INSTANCE_CLASS="db.t3.small"
        DB_ALLOCATED_STORAGE="50"
        DB_MULTI_AZ="false"
        DB_BACKUP_RETENTION_DAYS="14"
    else  # production
        read -p "RDS Instance Class [db.r5.large]: " DB_INSTANCE_CLASS
        DB_INSTANCE_CLASS=${DB_INSTANCE_CLASS:-db.r5.large}

        read -p "Allocated Storage (GB) [100]: " DB_ALLOCATED_STORAGE
        DB_ALLOCATED_STORAGE=${DB_ALLOCATED_STORAGE:-100}

        DB_MULTI_AZ="true"

        read -p "Backup Retention Days [30]: " DB_BACKUP_RETENTION_DAYS
        DB_BACKUP_RETENTION_DAYS=${DB_BACKUP_RETENTION_DAYS:-30}
    fi
fi

echo ""

# ============================================
# Step 5: Azure OpenAI Configuration
# ============================================
echo -e "${BLUE}${BOLD}Step 4: Azure OpenAI Configuration${NC}"
echo ""

if [ "$ENVIRONMENT" = "production" ]; then
    echo -e "${YELLOW}⚠ For production, store credentials in AWS Secrets Manager!${NC}"
    echo "Leave these empty and use Secrets Manager instead."
    echo ""
    read -p "Do you want to set these now anyway? (yes/no) [no]: " SET_AZURE
    SET_AZURE=${SET_AZURE:-no}

    if [ "$SET_AZURE" = "yes" ]; then
        read -p "Azure OpenAI API Key: " AZURE_OPENAI_API_KEY
        read -p "Azure OpenAI Endpoint: " AZURE_OPENAI_ENDPOINT
    else
        AZURE_OPENAI_API_KEY=""
        AZURE_OPENAI_ENDPOINT=""
    fi
else
    echo "Get these from: Azure Portal > Your OpenAI Resource > Keys and Endpoint"
    echo ""
    read -p "Azure OpenAI API Key: " AZURE_OPENAI_API_KEY
    read -p "Azure OpenAI Endpoint: " AZURE_OPENAI_ENDPOINT

    if [ -z "$AZURE_OPENAI_API_KEY" ] || [ -z "$AZURE_OPENAI_ENDPOINT" ]; then
        echo -e "${RED}✗ Azure OpenAI credentials are required${NC}"
        exit 1
    fi
fi

echo ""

# ============================================
# Step 6: Optional Configuration
# ============================================
echo -e "${BLUE}${BOLD}Step 5: Optional Configuration${NC}"
echo ""

read -p "Mistral API Key (optional, press Enter to skip): " MISTRAL_API_KEY

# Node environment
if [ "$ENVIRONMENT" = "dev" ]; then
    NODE_ENV="development"
    LOG_LEVEL="debug"
    LOG_RETENTION_DAYS="7"
elif [ "$ENVIRONMENT" = "staging" ]; then
    NODE_ENV="staging"
    LOG_LEVEL="info"
    LOG_RETENTION_DAYS="14"
else
    NODE_ENV="production"
    LOG_LEVEL="warn"
    LOG_RETENTION_DAYS="30"
fi

echo ""

# ============================================
# Step 7: Review Configuration
# ============================================
echo -e "${BLUE}${BOLD}Step 6: Review Configuration${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BOLD}Configuration Summary${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Environment: $ENVIRONMENT"
echo "AWS Region: $AWS_REGION"
echo "AWS Profile: $AWS_PROFILE"
echo "AWS Account: $AWS_ACCOUNT"
echo ""
echo "Database:"
echo "  External: $USE_EXTERNAL_DATABASE"
if [ "$USE_EXTERNAL_DATABASE" = "true" ]; then
    echo "  URL: ${DATABASE_URL:0:30}..."
else
    echo "  Instance: ${DB_INSTANCE_CLASS:-N/A}"
    echo "  Storage: ${DB_ALLOCATED_STORAGE:-N/A} GB"
    echo "  Multi-AZ: ${DB_MULTI_AZ:-N/A}"
fi
echo ""
echo "Azure OpenAI:"
if [ -n "$AZURE_OPENAI_API_KEY" ]; then
    echo "  API Key: ${AZURE_OPENAI_API_KEY:0:8}..."
else
    echo "  API Key: (will use Secrets Manager)"
fi
if [ -n "$AZURE_OPENAI_ENDPOINT" ]; then
    echo "  Endpoint: $AZURE_OPENAI_ENDPOINT"
else
    echo "  Endpoint: (will use Secrets Manager)"
fi
echo ""
echo "Application:"
echo "  NODE_ENV: $NODE_ENV"
echo "  LOG_LEVEL: $LOG_LEVEL"
echo "  LOG_RETENTION: $LOG_RETENTION_DAYS days"
echo ""

read -p "Is this correct? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Setup cancelled"
    exit 0
fi

echo ""

# ============================================
# Step 8: Generate .env File
# ============================================
echo -e "${BLUE}${BOLD}Step 7: Generating .env File${NC}"
echo ""

cat > .env <<EOF
# CIRA Invoice AWS - Environment Configuration
# Generated: $(date)
# Environment: $ENVIRONMENT

# ============================================
# AWS Configuration
# ============================================
AWS_REGION=$AWS_REGION
AWS_PROFILE=$AWS_PROFILE
CDK_DEFAULT_ACCOUNT=$AWS_ACCOUNT
CDK_DEFAULT_REGION=$AWS_REGION

# ============================================
# Database Configuration
# ============================================
USE_EXTERNAL_DATABASE=$USE_EXTERNAL_DATABASE
EOF

if [ "$USE_EXTERNAL_DATABASE" = "true" ]; then
    echo "DATABASE_URL=$DATABASE_URL" >> .env
else
    echo "" >> .env
    echo "# RDS Configuration" >> .env
    echo "DB_INSTANCE_CLASS=${DB_INSTANCE_CLASS}" >> .env
    echo "DB_ALLOCATED_STORAGE=${DB_ALLOCATED_STORAGE}" >> .env
    echo "DB_MULTI_AZ=${DB_MULTI_AZ}" >> .env
    echo "DB_BACKUP_RETENTION_DAYS=${DB_BACKUP_RETENTION_DAYS}" >> .env
fi

cat >> .env <<EOF

# ============================================
# Azure OpenAI Configuration
# ============================================
AZURE_OPENAI_API_KEY=$AZURE_OPENAI_API_KEY
AZURE_OPENAI_ENDPOINT=$AZURE_OPENAI_ENDPOINT

# ============================================
# Mistral Configuration (Optional)
# ============================================
MISTRAL_API_KEY=$MISTRAL_API_KEY

# ============================================
# Application Configuration
# ============================================
NODE_ENV=$NODE_ENV
LOG_LEVEL=$LOG_LEVEL

# ============================================
# Deployment Configuration
# ============================================
STACK_PREFIX=CiraInvoice
ENABLE_DELETION_PROTECTION=$([ "$ENVIRONMENT" = "dev" ] && echo "false" || echo "true")
LOG_RETENTION_DAYS=$LOG_RETENTION_DAYS
EOF

echo -e "${GREEN}✓ Created .env file${NC}"
echo ""

# ============================================
# Step 9: Validate Configuration
# ============================================
echo -e "${BLUE}${BOLD}Step 8: Validating Configuration${NC}"
echo ""

if ./scripts/deploy/validate-env.sh $ENVIRONMENT; then
    echo -e "${GREEN}✓ Configuration is valid!${NC}"
else
    echo -e "${YELLOW}⚠ Configuration has warnings${NC}"
fi

echo ""

# ============================================
# Next Steps
# ============================================
echo -e "${BLUE}${BOLD}Next Steps${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Review your .env file:"
echo "   cat .env"
echo ""
echo "2. Validate AWS setup:"
echo "   ./scripts/deploy/validate-aws-setup.sh $ENVIRONMENT"
echo ""
echo "3. Deploy:"
echo "   ./scripts/deploy/deploy.sh $ENVIRONMENT"
echo ""

if [ "$ENVIRONMENT" = "production" ]; then
    echo -e "${YELLOW}${BOLD}Production Checklist:${NC}"
    echo "  [ ] Store secrets in AWS Secrets Manager"
    echo "  [ ] Enable MFA for AWS account"
    echo "  [ ] Review IAM permissions"
    echo "  [ ] Configure CloudWatch alarms"
    echo "  [ ] Document rollback procedures"
    echo ""
fi

echo -e "${GREEN}${BOLD}Environment setup complete!${NC}"
