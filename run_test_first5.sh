#!/bin/bash

# Test First 5 Invoices Script
# Tests the batch processing with 5 invoices

set -e

cd "$(dirname "$0")"

# Default values
CONCURRENCY=3
TIMEOUT=300000

# Set API configuration from environment or use defaults
# These match the current deployed API Gateway endpoint
export API_ENDPOINT="${API_ENDPOINT:-https://nldl5jl1x6.execute-api.us-east-1.amazonaws.com/dev}"
export API_KEY="${API_KEY:-Mwaf64Bevy7Jl7ynOtsCK2St9GHpqHbya3Ct2HVs}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --concurrency=*)
      CONCURRENCY="${1#*=}"
      shift
      ;;
    --concurrency)
      CONCURRENCY="$2"
      shift 2
      ;;
    --timeout=*)
      TIMEOUT="${1#*=}"
      shift
      ;;
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--concurrency=5] [--timeout=300000]"
      exit 1
      ;;
  esac
done

echo "🧪 Testing first 5 invoices..."
echo "   API Endpoint: $API_ENDPOINT"
echo "   Concurrency: $CONCURRENCY"
echo "   Timeout: ${TIMEOUT}ms"
echo ""

node scripts/test-first5.js --concurrency=$CONCURRENCY --timeout=$TIMEOUT
