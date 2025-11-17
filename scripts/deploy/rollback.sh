#!/bin/bash

# ============================================
# CIRA Invoice AWS - Automated Rollback
# ============================================
# This script performs automated rollback of CloudFormation stacks

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Environment (dev, staging, prod)
ENVIRONMENT=${1:-dev}
AWS_REGION=${AWS_REGION:-us-east-1}

# Stack names
API_STACK="CiraInvoice-Api-${ENVIRONMENT}"
WORKFLOW_STACK="CiraInvoice-Workflow-${ENVIRONMENT}"
MONITORING_STACK="CiraInvoice-Monitoring-${ENVIRONMENT}"
DATABASE_STACK="CiraInvoice-Database-${ENVIRONMENT}"

echo -e "${RED}${BOLD}"
echo "╔════════════════════════════════════════════╗"
echo "║                                            ║"
echo "║         Deployment Rollback                ║"
echo "║                                            ║"
echo "╚════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "${BLUE}Environment:${NC} ${BOLD}${ENVIRONMENT}${NC}"
echo -e "${BLUE}Region:${NC} $AWS_REGION"
echo ""

# ============================================
# Safety Check
# ============================================
if [ "$ENVIRONMENT" = "prod" ]; then
    echo -e "${RED}${BOLD}⚠  WARNING: ROLLING BACK PRODUCTION${NC}"
    echo ""
    read -p "Are you absolutely sure? Type 'rollback-production' to confirm: " CONFIRM
    if [ "$CONFIRM" != "rollback-production" ]; then
        echo "Rollback cancelled"
        exit 0
    fi
    echo ""
fi

# ============================================
# Helper Functions
# ============================================

get_stack_status() {
    local STACK_NAME=$1
    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].StackStatus' \
        --output text 2>/dev/null || echo "NOT_FOUND"
}

cancel_stack_update() {
    local STACK_NAME=$1
    echo "Canceling update for $STACK_NAME..."

    if aws cloudformation cancel-update-stack \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" 2>&1; then
        echo -e "${GREEN}✓${NC} Update canceled for $STACK_NAME"
        return 0
    else
        echo -e "${RED}✗${NC} Failed to cancel update for $STACK_NAME"
        return 1
    fi
}

wait_for_stack() {
    local STACK_NAME=$1
    local EXPECTED_STATUS=$2

    echo "Waiting for $STACK_NAME to reach $EXPECTED_STATUS..."

    local MAX_WAIT=600  # 10 minutes
    local WAITED=0

    while [ $WAITED -lt $MAX_WAIT ]; do
        local STATUS=$(get_stack_status "$STACK_NAME")

        if [[ "$STATUS" == *"$EXPECTED_STATUS"* ]]; then
            echo -e "${GREEN}✓${NC} $STACK_NAME reached $EXPECTED_STATUS"
            return 0
        fi

        if [[ "$STATUS" == *"FAILED"* ]]; then
            echo -e "${RED}✗${NC} $STACK_NAME is in failed state: $STATUS"
            return 1
        fi

        echo "  Status: $STATUS (waited ${WAITED}s)"
        sleep 10
        WAITED=$((WAITED + 10))
    done

    echo -e "${RED}✗${NC} Timeout waiting for $STACK_NAME"
    return 1
}

# ============================================
# Check Stack Status
# ============================================
echo -e "${BLUE}[1/4]${NC} Checking stack status..."
echo ""

ALL_STACKS=("$API_STACK" "$WORKFLOW_STACK" "$MONITORING_STACK")

# Only check database stack if not using external database
if [ "$USE_EXTERNAL_DATABASE" != "true" ]; then
    ALL_STACKS+=("$DATABASE_STACK")
fi

for STACK in "${ALL_STACKS[@]}"; do
    STATUS=$(get_stack_status "$STACK")
    echo "  $STACK: $STATUS"

    if [[ "$STATUS" == *"IN_PROGRESS"* ]]; then
        echo -e "${YELLOW}⚠${NC} Stack update in progress"
        read -p "Cancel this update? (yes/no): " CANCEL
        if [ "$CANCEL" = "yes" ]; then
            cancel_stack_update "$STACK"
            wait_for_stack "$STACK" "UPDATE_ROLLBACK_COMPLETE"
        fi
    fi
done

echo ""

# ============================================
# Rollback Options
# ============================================
echo -e "${BLUE}[2/4]${NC} Select rollback method..."
echo ""
echo "1) Cancel in-progress updates (rollback to previous state)"
echo "2) Delete stacks completely"
echo "3) Rollback to specific version (not implemented)"
echo "4) Cancel (no changes)"
echo ""
read -p "Enter your choice (1-4): " ROLLBACK_CHOICE

case $ROLLBACK_CHOICE in
    1)
        ROLLBACK_METHOD="cancel"
        ;;
    2)
        ROLLBACK_METHOD="delete"
        ;;
    3)
        echo -e "${YELLOW}⚠ Version-specific rollback not yet implemented${NC}"
        echo "Use option 1 or 2"
        exit 1
        ;;
    4)
        echo "Rollback cancelled"
        exit 0
        ;;
    *)
        echo -e "${RED}✗ Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""

# ============================================
# Execute Rollback
# ============================================
echo -e "${BLUE}[3/4]${NC} Executing rollback..."
echo ""

if [ "$ROLLBACK_METHOD" = "cancel" ]; then
    # Cancel updates (rollback to previous state)
    for STACK in "${ALL_STACKS[@]}"; do
        STATUS=$(get_stack_status "$STACK")

        if [[ "$STATUS" == *"UPDATE_IN_PROGRESS"* ]]; then
            echo "Rolling back $STACK..."
            cancel_stack_update "$STACK"
            wait_for_stack "$STACK" "UPDATE_ROLLBACK_COMPLETE"
        elif [[ "$STATUS" == *"UPDATE_COMPLETE_CLEANUP_IN_PROGRESS"* ]]; then
            echo "Waiting for $STACK to complete..."
            wait_for_stack "$STACK" "UPDATE_COMPLETE"
        else
            echo -e "${YELLOW}⚠${NC} $STACK is not in UPDATE_IN_PROGRESS state"
        fi
    done

elif [ "$ROLLBACK_METHOD" = "delete" ]; then
    # Delete stacks
    echo -e "${RED}${BOLD}⚠  WARNING: This will DELETE all stacks${NC}"
    echo ""
    read -p "Type 'DELETE' to confirm: " DELETE_CONFIRM
    if [ "$DELETE_CONFIRM" != "DELETE" ]; then
        echo "Deletion cancelled"
        exit 0
    fi

    # Delete in reverse order (application first, database last)
    STACKS_TO_DELETE=("$MONITORING_STACK" "$WORKFLOW_STACK" "$API_STACK")

    for STACK in "${STACKS_TO_DELETE[@]}"; do
        STATUS=$(get_stack_status "$STACK")

        if [ "$STATUS" != "NOT_FOUND" ]; then
            echo "Deleting $STACK..."

            if aws cloudformation delete-stack \
                --stack-name "$STACK" \
                --region "$AWS_REGION"; then
                echo -e "${GREEN}✓${NC} Initiated deletion of $STACK"
            else
                echo -e "${RED}✗${NC} Failed to delete $STACK"
            fi
        else
            echo -e "${YELLOW}⚠${NC} $STACK not found (already deleted?)"
        fi
    done

    # Wait for deletions
    for STACK in "${STACKS_TO_DELETE[@]}"; do
        STATUS=$(get_stack_status "$STACK")
        if [ "$STATUS" != "NOT_FOUND" ]; then
            wait_for_stack "$STACK" "DELETE_COMPLETE"
        fi
    done

    # Delete database stack last
    if [ "$USE_EXTERNAL_DATABASE" != "true" ]; then
        echo ""
        echo -e "${RED}${BOLD}⚠  About to delete DATABASE STACK${NC}"
        echo "This will DELETE the RDS instance and ALL DATA!"
        echo ""
        read -p "Type 'DELETE-DATABASE' to confirm: " DB_DELETE_CONFIRM

        if [ "$DB_DELETE_CONFIRM" = "DELETE-DATABASE" ]; then
            echo "Deleting $DATABASE_STACK..."

            # Disable deletion protection first
            aws rds modify-db-instance \
                --db-instance-identifier "cira-invoice-${ENVIRONMENT}" \
                --no-deletion-protection \
                --region "$AWS_REGION" 2>/dev/null || true

            if aws cloudformation delete-stack \
                --stack-name "$DATABASE_STACK" \
                --region "$AWS_REGION"; then
                echo -e "${GREEN}✓${NC} Initiated deletion of $DATABASE_STACK"
                wait_for_stack "$DATABASE_STACK" "DELETE_COMPLETE"
            else
                echo -e "${RED}✗${NC} Failed to delete $DATABASE_STACK"
            fi
        else
            echo "Database deletion cancelled"
        fi
    fi
fi

echo ""

# ============================================
# Verification
# ============================================
echo -e "${BLUE}[4/4]${NC} Verifying rollback..."
echo ""

for STACK in "${ALL_STACKS[@]}"; do
    STATUS=$(get_stack_status "$STACK")
    echo "  $STACK: $STATUS"
done

echo ""

# ============================================
# Clean Up
# ============================================
echo "Cleaning up deployment artifacts..."

# Remove deployment config files
rm -f deployment-${ENVIRONMENT}.config
rm -f outputs-*-${ENVIRONMENT}.json

echo -e "${GREEN}✓${NC} Cleanup complete"
echo ""

# ============================================
# Summary
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Rollback Summary${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ "$ROLLBACK_METHOD" = "cancel" ]; then
    echo -e "${GREEN}✓ Rollback completed${NC}"
    echo "Stacks have been rolled back to their previous state"
elif [ "$ROLLBACK_METHOD" = "delete" ]; then
    echo -e "${GREEN}✓ Deletion completed${NC}"
    echo "All stacks have been deleted"
fi

echo ""
echo "Next steps:"
echo "1. Review CloudFormation console for any remaining resources"
echo "2. Check CloudWatch logs for errors during rollback"
echo "3. If needed, redeploy: ./scripts/deploy/deploy.sh ${ENVIRONMENT}"
echo ""

# ============================================
# Log Rollback
# ============================================
ROLLBACK_LOG="rollbacks.log"
echo "[$(date)] Rolled back ${ENVIRONMENT} using method: ${ROLLBACK_METHOD}" >> "$ROLLBACK_LOG"

echo -e "${GREEN}${BOLD}Rollback complete!${NC}"
