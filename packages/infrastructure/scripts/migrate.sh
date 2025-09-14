#!/usr/bin/env bash
set -euo pipefail

# Usage: migrate.sh [environment]
# environment: dev|staging|prod (default: dev)

ENVIRONMENT="${1:-dev}"
STACK="CiraInvoice-Api-${ENVIRONMENT}"

# Determine region with fallbacks
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-}}"
if [[ -z "${REGION}" ]]; then
  REGION="$(aws configure get region 2>/dev/null || true)"
fi
REGION="${REGION:-us-east-1}"

echo "Using stack: ${STACK}, region: ${REGION}"

# Lookup ARN from CloudFormation outputs
ARN=$(aws cloudformation describe-stacks \
  --stack-name "${STACK}" \
  --region "${REGION}" \
  --query "Stacks[0].Outputs[?OutputKey=='DbMigrateFunctionArn'].OutputValue" \
  --output text 2>/dev/null || true)

if [[ -z "${ARN}" || "${ARN}" == "None" ]]; then
  echo "Error: DbMigrateFunctionArn not found for stack ${STACK} in region ${REGION}." 1>&2
  echo "Stack outputs:" 1>&2
  aws cloudformation describe-stacks --stack-name "${STACK}" --region "${REGION}" --query "Stacks[0].Outputs" --output table || true
  exit 1
fi

echo "Invoking ${ARN} in ${REGION} ..."
aws lambda invoke \
  --function-name "${ARN}" \
  /tmp/out.json \
  --region "${REGION}" \
  --log-type Tail \
  --query LogResult \
  --output text | base64 --decode || true

echo
echo "Response saved to /tmp/out.json"

