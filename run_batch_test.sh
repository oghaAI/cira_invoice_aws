#!/bin/bash

# Batch Invoice Testing Wrapper Script
# Runs the batch test with optional parameters

# Set working directory to project root
cd "$(dirname "$0")"

# Default values
CONCURRENCY=3
TIMEOUT=300000
LIMIT=0
TYPE="community"

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
    --type=*)
      TYPE="${1#*=}"
      shift
      ;;
    --type)
      TYPE="$2"
      shift 2
      ;;
    --help)
      echo "Usage: ./run_batch_test.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --type TYPE        Verification type: community, vendor, amount, or account (default: community)"
      echo "  --concurrency N    Number of concurrent jobs (default: 3)"
      echo "  --timeout MS       Timeout per job in milliseconds (default: 300000)"
      echo "  --limit N          Process only next N invoices (default: 0 = no limit)"
      echo "  --help             Show this help message"
      echo ""
      echo "Examples:"
      echo "  ./run_batch_test.sh --type=vendor --concurrency=5"
      echo "  ./run_batch_test.sh --type=community --limit=5"
      echo "  ./run_batch_test.sh --concurrency=5 --timeout=600000"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Validate verification type folder and input file
VERIFICATION_DIR="verifications/$TYPE"
INPUT_FILE="$VERIFICATION_DIR/${TYPE}_list.csv"

if [ ! -d "$VERIFICATION_DIR" ]; then
  echo "❌ Error: Verification folder '$VERIFICATION_DIR' does not exist"
  echo ""
  echo "Available verification types:"
  ls -d verifications/*/ 2>/dev/null | sed 's|verifications/||g' | sed 's|/||g' | sed 's/^/  - /'
  exit 1
fi

if [ ! -f "$INPUT_FILE" ]; then
  echo "❌ Error: Input file '$INPUT_FILE' does not exist"
  exit 1
fi

# Run the batch test
if [ $LIMIT -gt 0 ]; then
  echo "Starting batch test for type='$TYPE' with concurrency=$CONCURRENCY, timeout=${TIMEOUT}ms, limit=$LIMIT"
else
  echo "Starting batch test for type='$TYPE' with concurrency=$CONCURRENCY, timeout=${TIMEOUT}ms"
fi
echo ""

node scripts/batch-test-invoices.js --type=$TYPE --concurrency=$CONCURRENCY --timeout=$TIMEOUT --limit=$LIMIT

# Check exit code
if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Batch test completed successfully!"
  echo "📄 Results saved to: $VERIFICATION_DIR/results_*.csv (grouped by invoice type)"
else
  echo ""
  echo "❌ Batch test failed with errors"
  exit 1
fi
