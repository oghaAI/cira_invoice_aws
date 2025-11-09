#!/bin/bash

# Batch Invoice Testing Wrapper Script
# Runs the batch test with optional parameters

# Set working directory to project root
cd "$(dirname "$0")"

# Default values
CONCURRENCY=3
TIMEOUT=300000
LIMIT=0

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
    --limit=*)
      LIMIT="${1#*=}"
      shift
      ;;
    --limit)
      LIMIT="$2"
      shift 2
      ;;
    --help)
      echo "Usage: ./run_batch_test.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --concurrency N    Number of concurrent jobs (default: 3)"
      echo "  --timeout MS       Timeout per job in milliseconds (default: 300000)"
      echo "  --limit N          Process only next N invoices (default: 0 = no limit)"
      echo "  --help             Show this help message"
      echo ""
      echo "Examples:"
      echo "  ./run_batch_test.sh --concurrency=5 --timeout=600000"
      echo "  ./run_batch_test.sh --limit=5"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Run the batch test
if [ $LIMIT -gt 0 ]; then
  echo "Starting batch test with concurrency=$CONCURRENCY, timeout=${TIMEOUT}ms, limit=$LIMIT"
else
  echo "Starting batch test with concurrency=$CONCURRENCY, timeout=${TIMEOUT}ms"
fi
echo ""

node scripts/batch-test-invoices.js --concurrency=$CONCURRENCY --timeout=$TIMEOUT --limit=$LIMIT

# Check exit code
if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Batch test completed successfully!"
  echo "📄 Results saved to: verifications/community/results_*.csv (grouped by invoice type)"
else
  echo ""
  echo "❌ Batch test failed with errors"
  exit 1
fi
