# Monitoring Guide

This guide explains how to monitor the CIRA Invoice AWS system using CloudWatch and other AWS services.

## Table of Contents

- [Overview](#overview)
- [CloudWatch Dashboards](#cloudwatch-dashboards)
- [CloudWatch Alarms](#cloudwatch-alarms)
- [Log Groups](#log-groups)
- [Key Metrics](#key-metrics)
- [Setting Up Alerts](#setting-up-alerts)
- [Cost Monitoring](#cost-monitoring)

## Overview

The CIRA Invoice system includes comprehensive monitoring across all components:

- **Lambda Functions**: Invocations, errors, duration, memory
- **API Gateway**: Requests, latency, 4XX/5XX errors
- **Step Functions**: Executions, failures, duration
- **RDS**: Connections, CPU, storage, query performance
- **CloudWatch Logs**: Application logs, error tracking

## CloudWatch Dashboards

### Viewing Dashboards

```bash
# List all dashboards
aws cloudwatch list-dashboards

# Get dashboard for environment
aws cloudwatch get-dashboard \
  --dashboard-name CiraInvoice-${ENVIRONMENT}
```

### Main Dashboard Widgets

The monitoring stack creates a dashboard with these widgets:

#### 1. API Gateway Metrics
- Total requests (count)
- 4XX errors (client errors)
- 5XX errors (server errors)
- API latency (p50, p90, p99)

#### 2. Lambda Metrics
- Invocations per function
- Error count and rate
- Duration (average, max)
- Throttles
- Concurrent executions

#### 3. Step Functions Metrics
- Executions started
- Executions succeeded
- Executions failed
- Execution time

#### 4. RDS Metrics (if using RDS)
- CPU utilization
- Database connections
- Free storage space
- Read/Write IOPS
- Replication lag (Multi-AZ)

### Creating Custom Dashboards

```bash
# Create custom dashboard
aws cloudwatch put-dashboard \
  --dashboard-name CiraInvoice-Custom-${ENVIRONMENT} \
  --dashboard-body file://custom-dashboard.json
```

Example dashboard JSON:
```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/Lambda", "Invocations", {"stat": "Sum"}]
        ],
        "period": 300,
        "stat": "Sum",
        "region": "us-east-1",
        "title": "Lambda Invocations"
      }
    }
  ]
}
```

## CloudWatch Alarms

### Default Alarms

The monitoring stack creates these alarms:

#### Lambda Errors
```bash
# Alarm when error rate > 5%
AlarmName: CiraInvoice-Lambda-Errors-${ENVIRONMENT}
Metric: Errors
Threshold: > 5% of invocations
Period: 5 minutes
Evaluation Periods: 2
```

#### API Gateway 5XX Errors
```bash
# Alarm when server errors occur
AlarmName: CiraInvoice-ApiGateway-5XX-${ENVIRONMENT}
Metric: 5XXError
Threshold: > 10 errors
Period: 5 minutes
Evaluation Periods: 1
```

#### Step Functions Failures
```bash
# Alarm when executions fail
AlarmName: CiraInvoice-StepFunctions-Failures-${ENVIRONMENT}
Metric: ExecutionsFailed
Threshold: > 5 failures
Period: 5 minutes
Evaluation Periods: 1
```

#### RDS CPU (if using RDS)
```bash
# Alarm when CPU utilization is high
AlarmName: CiraInvoice-RDS-HighCPU-${ENVIRONMENT}
Metric: CPUUtilization
Threshold: > 80%
Period: 5 minutes
Evaluation Periods: 2
```

### Viewing Alarms

```bash
# List all alarms
aws cloudwatch describe-alarms \
  --alarm-name-prefix CiraInvoice

# Get alarm details
aws cloudwatch describe-alarms \
  --alarm-names CiraInvoice-Lambda-Errors-${ENVIRONMENT}

# Check alarm history
aws cloudwatch describe-alarm-history \
  --alarm-name CiraInvoice-Lambda-Errors-${ENVIRONMENT} \
  --max-records 10
```

### Creating Custom Alarms

```bash
# Create custom alarm
aws cloudwatch put-metric-alarm \
  --alarm-name CiraInvoice-Custom-${ENVIRONMENT} \
  --alarm-description "Custom alarm for specific metric" \
  --metric-name Invocations \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 1000 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --dimensions Name=FunctionName,Value=CiraInvoice-JobManagement-${ENVIRONMENT}
```

## Log Groups

### Available Log Groups

```bash
# List all log groups
aws logs describe-log-groups \
  --log-group-name-prefix /aws/lambda/CiraInvoice

# Main log groups:
/aws/lambda/CiraInvoice-JobManagement-${ENVIRONMENT}
/aws/lambda/CiraInvoice-OcrProcessing-${ENVIRONMENT}
/aws/lambda/CiraInvoice-LlmExtraction-${ENVIRONMENT}
/aws/apigateway/CiraInvoice-${ENVIRONMENT}
/aws/stepfunctions/CiraInvoice-Workflow-${ENVIRONMENT}
```

### Viewing Logs

#### Real-time Tailing
```bash
# Tail logs in real-time
aws logs tail /aws/lambda/CiraInvoice-JobManagement-${ENVIRONMENT} --follow

# Tail with filter
aws logs tail /aws/lambda/CiraInvoice-JobManagement-${ENVIRONMENT} \
  --follow \
  --filter-pattern "ERROR"

# Tail from specific time
aws logs tail /aws/lambda/CiraInvoice-JobManagement-${ENVIRONMENT} \
  --since 30m \
  --follow
```

#### Search Logs
```bash
# Search for errors in last hour
aws logs filter-log-events \
  --log-group-name /aws/lambda/CiraInvoice-JobManagement-${ENVIRONMENT} \
  --start-time $(date -u -d '1 hour ago' +%s)000 \
  --filter-pattern "ERROR"

# Search with specific pattern
aws logs filter-log-events \
  --log-group-name /aws/lambda/CiraInvoice-JobManagement-${ENVIRONMENT} \
  --start-time $(date -u -d '1 hour ago' +%s)000 \
  --filter-pattern "[time, request_id, level=ERROR, ...]"

# Export logs to JSON
aws logs filter-log-events \
  --log-group-name /aws/lambda/CiraInvoice-JobManagement-${ENVIRONMENT} \
  --start-time $(date -u -d '24 hours ago' +%s)000 \
  --output json > logs-export.json
```

### Log Insights Queries

```bash
# Run Log Insights query
aws logs start-query \
  --log-group-name /aws/lambda/CiraInvoice-JobManagement-${ENVIRONMENT} \
  --start-time $(date -u -d '1 hour ago' +%s) \
  --end-time $(date -u +%s) \
  --query-string 'fields @timestamp, @message | filter @message like /ERROR/ | sort @timestamp desc | limit 20'
```

**Common Queries**:

1. **Error Rate**:
```
fields @timestamp, @message
| filter @message like /ERROR/
| stats count() as errors by bin(5m)
```

2. **Slowest Requests**:
```
fields @timestamp, @message, @duration
| sort @duration desc
| limit 20
```

3. **Requests by Status Code**:
```
fields @timestamp, statusCode
| stats count() by statusCode
```

## Key Metrics

### Lambda Metrics

#### Invocations
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=CiraInvoice-JobManagement-${ENVIRONMENT} \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

#### Errors
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=CiraInvoice-JobManagement-${ENVIRONMENT} \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

#### Duration
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=CiraInvoice-JobManagement-${ENVIRONMENT} \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,Maximum
```

### API Gateway Metrics

#### Request Count
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name Count \
  --dimensions Name=ApiName,Value=CiraInvoice-${ENVIRONMENT} \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

#### Latency
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name Latency \
  --dimensions Name=ApiName,Value=CiraInvoice-${ENVIRONMENT} \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,p99
```

### RDS Metrics (if using RDS)

#### CPU Utilization
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name CPUUtilization \
  --dimensions Name=DBInstanceIdentifier,Value=cira-invoice-${ENVIRONMENT} \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,Maximum
```

#### Database Connections
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name DatabaseConnections \
  --dimensions Name=DBInstanceIdentifier,Value=cira-invoice-${ENVIRONMENT} \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,Maximum
```

## Setting Up Alerts

### SNS Topics

Create an SNS topic for notifications:

```bash
# Create SNS topic
aws sns create-topic \
  --name cira-invoice-${ENVIRONMENT}-alerts

# Subscribe with email
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:ACCOUNT:cira-invoice-${ENVIRONMENT}-alerts \
  --protocol email \
  --notification-endpoint your-email@company.com

# Confirm subscription in email

# Add topic ARN to alarms
aws cloudwatch put-metric-alarm \
  --alarm-name CiraInvoice-Lambda-Errors-${ENVIRONMENT} \
  --alarm-actions arn:aws:sns:us-east-1:ACCOUNT:cira-invoice-${ENVIRONMENT}-alerts \
  ... (other alarm parameters)
```

### Slack Integration

Use AWS Chatbot for Slack notifications:

```bash
# Configure via AWS Console:
# 1. Open AWS Chatbot
# 2. Configure new Slack channel
# 3. Add SNS topic as notification source
# 4. Test notification

# Or use Lambda webhook:
# Create Lambda function that posts to Slack webhook URL
# Trigger from SNS topic
```

### PagerDuty Integration

```bash
# Use SNS HTTPS endpoint:
# 1. Get PagerDuty integration URL
# 2. Create SNS subscription with HTTPS protocol
# 3. Use PagerDuty URL as endpoint

aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:ACCOUNT:cira-invoice-prod-alerts \
  --protocol https \
  --notification-endpoint https://events.pagerduty.com/integration/...
```

## Cost Monitoring

### AWS Cost Explorer

```bash
# Get cost for last 30 days
aws ce get-cost-and-usage \
  --time-period Start=$(date -u -d '30 days ago' +%Y-%m-%d),End=$(date -u +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics UnblendedCost \
  --group-by Type=TAG,Key=Environment \
  --filter file://cost-filter.json
```

### Budget Alerts

```bash
# Create budget
aws budgets create-budget \
  --account-id ACCOUNT_ID \
  --budget file://budget.json \
  --notifications-with-subscribers file://notifications.json
```

Example budget.json:
```json
{
  "BudgetName": "CiraInvoice-Monthly-Budget",
  "BudgetLimit": {
    "Amount": "500",
    "Unit": "USD"
  },
  "TimeUnit": "MONTHLY",
  "BudgetType": "COST"
}
```

### Cost by Service

Track costs by service:
- **Lambda**: Invocations + duration
- **API Gateway**: Requests
- **RDS**: Instance hours + storage
- **CloudWatch**: Logs + metrics
- **Data Transfer**: Outbound data

## Monitoring Best Practices

### 1. Set Up Alerts Early

Configure alarms before issues occur:
- Lambda error rate > 5%
- API Gateway 5XX errors > 10
- RDS CPU > 80%
- RDS storage < 20% free

### 2. Monitor Key Metrics

Focus on:
- **Availability**: API health, error rates
- **Performance**: Latency, duration
- **Capacity**: Concurrent executions, connections
- **Cost**: Daily spend trends

### 3. Use Log Aggregation

- Enable structured logging (JSON format)
- Add correlation IDs to requests
- Include context in log messages
- Set appropriate log levels

### 4. Create Runbooks

Document responses to common alerts:
- High error rate → Check logs, rollback if needed
- High latency → Check database, increase Lambda memory
- Out of capacity → Increase limits, optimize code

### 5. Regular Reviews

- Weekly: Review error trends
- Monthly: Analyze costs and usage
- Quarterly: Review and update alarms

## Troubleshooting with Monitoring

### High Error Rate

```bash
# 1. Check recent errors
aws logs tail /aws/lambda/CiraInvoice-JobManagement-${ENVIRONMENT} \
  --since 30m \
  --filter-pattern "ERROR"

# 2. Get error metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=CiraInvoice-JobManagement-${ENVIRONMENT} \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Sum

# 3. Check for pattern
# Look for common error messages
```

### Slow Performance

```bash
# 1. Check Lambda duration
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=CiraInvoice-JobManagement-${ENVIRONMENT} \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average,p99

# 2. Check database performance
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name ReadLatency \
  --dimensions Name=DBInstanceIdentifier,Value=cira-invoice-${ENVIRONMENT} \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,Maximum
```

## Additional Resources

- [CloudWatch Documentation](https://docs.aws.amazon.com/cloudwatch/)
- [Lambda Metrics](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics.html)
- [RDS Metrics](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/MonitoringOverview.html)
- [Cost Optimization](https://aws.amazon.com/pricing/cost-optimization/)
