# Community Invoice Batch Testing

This directory contains test data and results for batch invoice processing validation.

## Files

- **`community_list.csv`** - Input file with invoice URLs to test
- **`results.csv`** - Output file with extraction results (generated after test run)

## Input Format

`community_list.csv` contains:
```csv
WF_JOB_ID,PDF_URL
4098417,https://api.ciranet.com/ManagementPortal/api/ai/wf-invoice?EncryptedId=...
```

- `WF_JOB_ID`: Your workflow reference ID
- `PDF_URL`: URL to the invoice PDF

## Output Format

`results.csv` contains comprehensive extraction results:

### Core Columns
- `WF_JOB_ID` - Your workflow reference
- `PDF_URL` - Input URL
- `JOB_ID` - AWS job UUID
- `STATUS` - completed/failed/timeout/error
- `INVOICE_TYPE` - general/insurance/utility/tax
- `ERROR` - Error message if failed

### Extracted Field Columns
For each extracted field (e.g., `invoice_date`), there are columns:
- `{field}_value` - Extracted value
- `{field}_confidence` - Confidence level (high/medium/low)
- `{field}_reason_code` - Extraction reasoning code

Example columns:
- `invoice_date_value`, `invoice_date_confidence`, `invoice_date_reason_code`
- `vendor_name_value`, `vendor_name_confidence`, `vendor_name_reason_code`
- `total_amount_due_value`, `total_amount_due_confidence`, `total_amount_due_reason_code`

### Raw Data Column
- `RAW_EXTRACTION` - Full JSON result for detailed analysis

## Running Batch Tests

### Important: Resume Support
The script **automatically skips already-processed invoices** by checking the `results.csv` file. This means:
- ✅ You can safely re-run the script after failures
- ✅ Interrupted runs can be resumed
- ✅ No duplicate processing
- ✅ `WF_JOB_ID` is used as the unique identifier

### Quick Start
```bash
# From project root
./run_batch_test.sh
```

**On subsequent runs**, the script will:
1. Read existing `results.csv`
2. Skip invoices already processed
3. Only process new/failed invoices

### With Options
```bash
# Process 5 invoices concurrently with 10-minute timeout per invoice
./run_batch_test.sh --concurrency 5 --timeout 600000
```

### Direct Script Usage
```bash
node scripts/batch-test-invoices.js --concurrency=3 --timeout=300000
```

## Options

- `--concurrency N` - Number of invoices to process simultaneously (default: 3)
- `--timeout MS` - Maximum time per invoice in milliseconds (default: 300000 = 5 minutes)

## Example Output

Console during processing:
```
=== Batch Invoice Testing ===

API Endpoint: https://ddinwejucd.execute-api.us-east-1.amazonaws.com/dev
Concurrency: 3
Timeout: 300000ms

📂 Found 45 already-processed invoices (will skip)

📋 Total invoices in input: 92
⏭️  Skipped (already processed): 45
🔄 To process: 47

[4098417] Submitting job...
[4098417] Polling status (job: uuid-123)...
[4098417] Fetching results...
[4098417] ✅ Completed (utility)

=== Summary ===
Total in input: 92
⏭️  Skipped: 45
🔄 Processed: 47
✅ Completed: 44
❌ Failed: 2
⏱️  Timeout: 1
⏱️  Duration: 187.3s
📊 Success Rate: 93.6%

✅ Results written to: verifications/community/results.csv
```

## Analyzing Results

### Load in Excel/Google Sheets
1. Open `results.csv` in Excel or Google Sheets
2. Apply filters to columns for analysis
3. Sort by confidence levels to identify low-quality extractions

### Analyze with SQL
```sql
-- Load CSV into database, then query
SELECT
  INVOICE_TYPE,
  COUNT(*) as total,
  AVG(CASE WHEN invoice_date_confidence = 'high' THEN 1 ELSE 0 END) as date_confidence_rate
FROM results
WHERE STATUS = 'completed'
GROUP BY INVOICE_TYPE;
```

### Python Analysis
```python
import pandas as pd

# Load results
df = pd.read_csv('results.csv')

# Success rate by invoice type
print(df[df['STATUS'] == 'completed']['INVOICE_TYPE'].value_counts())

# Fields with low confidence
low_conf_fields = []
for col in df.columns:
    if col.endswith('_confidence'):
        low_conf = df[df[col] == 'low'][col].count()
        if low_conf > 0:
            low_conf_fields.append((col.replace('_confidence', ''), low_conf))

print("Fields with low confidence:")
for field, count in sorted(low_conf_fields, key=lambda x: x[1], reverse=True):
    print(f"  {field}: {count}")
```

## Troubleshooting

### Script Fails to Connect
- Verify API endpoint is correct in script or `API_ENDPOINT` env var
- Check AWS credentials and permissions
- Ensure Lambda functions are deployed

### Jobs Timing Out
- Increase timeout: `./run_batch_test.sh --timeout 600000`
- Check CloudWatch logs for Lambda errors
- Verify Step Functions are not stuck

### High Failure Rate
- Check `ERROR` column in results.csv for specific error messages
- Review CloudWatch logs for detailed error traces
- Verify invoice URLs are accessible

## Next Steps

After running tests:
1. Review `results.csv` for extraction quality
2. Identify patterns in low-confidence extractions
3. Analyze invoice types distribution
4. Compare extracted values against ground truth (if available)
5. Iterate on prompts or schema based on findings
