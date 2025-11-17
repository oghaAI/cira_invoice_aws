#!/bin/bash

# ============================================
# CIRA Invoice AWS - Environment Variable Validation
# ============================================
# This script validates that all required environment variables are set
# and properly formatted

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
echo -e "${BLUE}  Environment Variable Validation${NC}"
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

mask_value() {
    local value="$1"
    if [ ${#value} -gt 8 ]; then
        echo "${value:0:4}...${value: -4}"
    else
        echo "****"
    fi
}

validate_url() {
    local url="$1"
    if [[ "$url" =~ ^https?:// ]]; then
        return 0
    else
        return 1
    fi
}

# ============================================
# Load Environment Variables
# ============================================
echo "Loading environment variables..."

if [ -f .env ]; then
    # Load env file, handling inline comments properly
    # The || [[ -n "$line" ]] handles files without trailing newline
    while IFS= read -r line || [[ -n "$line" ]]; do
        # Skip empty lines and comments
        [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
        # Only process valid variable assignments
        if [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
            # Extract variable name
            var_name="${line%%=*}"
            # Extract value (everything after first =)
            var_value="${line#*=}"
            # Remove inline comments: strip trailing # and everything after (unless inside quotes)
            # Handle double-quoted values
            if [[ "$var_value" =~ ^\"([^\"]*)\" ]]; then
                var_value="${BASH_REMATCH[1]}"
            # Handle single-quoted values
            elif [[ "$var_value" =~ ^\'([^\']*)\' ]]; then
                var_value="${BASH_REMATCH[1]}"
            # Handle unquoted values (strip after space or #)
            else
                var_value="${var_value%% #*}"
                var_value="${var_value%%[[:space:]]}"
            fi
            export "${var_name}=${var_value}"
        fi
    done < .env
    print_check ".env file loaded"
elif [ -f ".env.${ENVIRONMENT}" ]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
        [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
        if [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
            var_name="${line%%=*}"
            var_value="${line#*=}"
            if [[ "$var_value" =~ ^\"([^\"]*)\" ]]; then
                var_value="${BASH_REMATCH[1]}"
            elif [[ "$var_value" =~ ^\'([^\']*)\' ]]; then
                var_value="${BASH_REMATCH[1]}"
            else
                var_value="${var_value%% #*}"
                var_value="${var_value%%[[:space:]]}"
            fi
            export "${var_name}=${var_value}"
        fi
    done < ".env.${ENVIRONMENT}"
    print_check ".env.${ENVIRONMENT} file loaded"
else
    print_warning "No .env file found"
fi

echo ""

# ============================================
# Validate AWS Configuration
# ============================================
echo -e "${BLUE}[1/4]${NC} Validating AWS configuration..."

# Accept either CDK_DEFAULT_REGION or AWS_REGION
if [ -n "$CDK_DEFAULT_REGION" ]; then
    print_check "CDK_DEFAULT_REGION: $CDK_DEFAULT_REGION"
    # Set AWS_REGION from CDK_DEFAULT_REGION if not already set
    if [ -z "$AWS_REGION" ]; then
        AWS_REGION="$CDK_DEFAULT_REGION"
    fi
elif [ -n "$AWS_REGION" ]; then
    print_check "AWS_REGION: $AWS_REGION"
else
    print_error "Neither CDK_DEFAULT_REGION nor AWS_REGION is set"
fi

if [ -z "$CDK_DEFAULT_ACCOUNT" ]; then
    print_warning "CDK_DEFAULT_ACCOUNT is not set (will be auto-detected)"
else
    print_check "CDK_DEFAULT_ACCOUNT: $CDK_DEFAULT_ACCOUNT"
fi

echo ""

# ============================================
# Validate Database Configuration
# ============================================
echo -e "${BLUE}[2/4]${NC} Validating database configuration..."

if [ -z "$USE_EXTERNAL_DATABASE" ]; then
    print_warning "USE_EXTERNAL_DATABASE not set (will default to false for ${ENVIRONMENT})"
    USE_EXTERNAL_DATABASE="false"
else
    print_check "USE_EXTERNAL_DATABASE: $USE_EXTERNAL_DATABASE"
fi

if [ "$USE_EXTERNAL_DATABASE" = "true" ]; then
    if [ -z "$DATABASE_URL" ]; then
        print_error "DATABASE_URL is required when USE_EXTERNAL_DATABASE=true"
    else
        # Validate DATABASE_URL format
        if [[ "$DATABASE_URL" =~ ^postgres(ql)?:// ]]; then
            print_check "DATABASE_URL is set and properly formatted"
        else
            print_error "DATABASE_URL must start with postgresql:// or postgres://"
        fi
    fi
else
    print_check "Using AWS RDS (DATABASE_URL will be retrieved from Secrets Manager)"
fi

echo ""

# ============================================
# Validate API Configuration
# ============================================
echo -e "${BLUE}[3/4]${NC} Validating API configuration..."

# Azure API (supports both new and legacy variable names)
# New: AZURE_API_KEY, AZURE_API_ENDPOINT, AZURE_MODEL
# Legacy: AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT
if [ -n "$AZURE_API_KEY" ]; then
    masked=$(mask_value "$AZURE_API_KEY")
    print_check "AZURE_API_KEY is set ($masked)"
elif [ -n "$AZURE_OPENAI_API_KEY" ]; then
    masked=$(mask_value "$AZURE_OPENAI_API_KEY")
    print_check "AZURE_OPENAI_API_KEY is set ($masked) [legacy]"
else
    print_error "AZURE_API_KEY (or AZURE_OPENAI_API_KEY) is required"
fi

if [ -n "$AZURE_API_ENDPOINT" ]; then
    if validate_url "$AZURE_API_ENDPOINT"; then
        print_check "AZURE_API_ENDPOINT: $AZURE_API_ENDPOINT"
    else
        print_error "AZURE_API_ENDPOINT must be a valid URL"
    fi
elif [ -n "$AZURE_OPENAI_ENDPOINT" ]; then
    if validate_url "$AZURE_OPENAI_ENDPOINT"; then
        print_check "AZURE_OPENAI_ENDPOINT: $AZURE_OPENAI_ENDPOINT [legacy]"
    else
        print_error "AZURE_OPENAI_ENDPOINT must be a valid URL"
    fi
else
    print_error "AZURE_API_ENDPOINT (or AZURE_OPENAI_ENDPOINT) is required"
fi

if [ -n "$AZURE_MODEL" ]; then
    print_check "AZURE_MODEL: $AZURE_MODEL"
elif [ -n "$AZURE_OPENAI_DEPLOYMENT" ]; then
    print_check "AZURE_OPENAI_DEPLOYMENT: $AZURE_OPENAI_DEPLOYMENT [legacy]"
else
    print_warning "AZURE_MODEL (or AZURE_OPENAI_DEPLOYMENT) not set"
fi

# OCR Provider Configuration
if [ -z "$OCR_PROVIDER" ]; then
    print_warning "OCR_PROVIDER not set (will default to 'internal')"
    OCR_PROVIDER="internal"
else
    print_check "OCR_PROVIDER: $OCR_PROVIDER"
fi

if [ "$OCR_PROVIDER" = "internal" ]; then
    if [ -z "$INTERNAL_OCR_URL" ]; then
        print_error "INTERNAL_OCR_URL is required when OCR_PROVIDER=internal"
    else
        if validate_url "$INTERNAL_OCR_URL"; then
            print_check "INTERNAL_OCR_URL: $INTERNAL_OCR_URL"
        else
            print_error "INTERNAL_OCR_URL must be a valid URL"
        fi
    fi
elif [ "$OCR_PROVIDER" = "mistral" ]; then
    if [ -z "$MISTRAL_API_KEY" ]; then
        print_error "MISTRAL_API_KEY is required when OCR_PROVIDER=mistral"
    else
        masked=$(mask_value "$MISTRAL_API_KEY")
        print_check "MISTRAL_API_KEY is set ($masked)"
    fi
    if [ -z "$MISTRAL_OCR_API_URL" ]; then
        print_warning "MISTRAL_OCR_API_URL not set (will use default)"
    else
        if validate_url "$MISTRAL_OCR_API_URL"; then
            print_check "MISTRAL_OCR_API_URL: $MISTRAL_OCR_API_URL"
        else
            print_error "MISTRAL_OCR_API_URL must be a valid URL"
        fi
    fi
else
    print_warning "Unknown OCR_PROVIDER: $OCR_PROVIDER"
fi

echo ""

# ============================================
# Validate Environment-Specific Settings
# ============================================
echo -e "${BLUE}[4/4]${NC} Validating ${ENVIRONMENT}-specific settings..."

case "$ENVIRONMENT" in
    dev)
        # Development can use external database
        if [ "$USE_EXTERNAL_DATABASE" != "true" ]; then
            print_warning "Development typically uses external database (Supabase)"
        fi

        if [ "${ENABLE_DELETION_PROTECTION:-false}" = "true" ]; then
            print_warning "Deletion protection enabled for development (unusual)"
        fi
        ;;

    staging)
        # Staging should use RDS
        if [ "$USE_EXTERNAL_DATABASE" = "true" ]; then
            print_warning "Staging should typically use RDS, not external database"
        fi

        if [ "${ENABLE_DELETION_PROTECTION:-true}" != "true" ]; then
            print_warning "Deletion protection should be enabled for staging"
        fi

        if [ "${LOG_RETENTION_DAYS:-7}" -lt 14 ]; then
            print_warning "Log retention should be at least 14 days for staging"
        fi
        ;;

    prod)
        # Production must use RDS
        if [ "$USE_EXTERNAL_DATABASE" = "true" ]; then
            print_error "Production MUST use RDS, not external database"
        fi

        if [ "${ENABLE_DELETION_PROTECTION:-true}" != "true" ]; then
            print_error "Deletion protection MUST be enabled for production"
        fi

        if [ "${LOG_RETENTION_DAYS:-7}" -lt 30 ]; then
            print_error "Log retention must be at least 30 days for production"
        fi

        if [ "${DB_MULTI_AZ:-false}" != "true" ]; then
            print_error "Multi-AZ must be enabled for production RDS"
        fi

        if [ "${NODE_ENV:-development}" != "production" ]; then
            print_warning "NODE_ENV should be 'production' for production deployment"
        fi
        ;;
esac

echo ""

# ============================================
# Summary
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Validation Summary${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All environment variables are valid!${NC}"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ Validation passed with ${WARNINGS} warning(s)${NC}"
    echo -e "Review the warnings above before deploying"
    exit 0
else
    echo -e "${RED}✗ Validation failed with ${ERRORS} error(s) and ${WARNINGS} warning(s)${NC}"
    echo -e "Fix the errors above before deploying"
    exit 1
fi
