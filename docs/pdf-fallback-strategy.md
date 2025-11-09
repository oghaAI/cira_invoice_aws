# PDF Fallback Strategy for Mistral OCR

## Problem

Mistral OCR rejects some PDF URLs with error:
```
"Could not determine document type from 'https://api.ciranet.com/...'"
Error code: 3310
Type: invalid_request_file
```

This happens because the URL doesn't end with `.pdf` extension, so Mistral can't determine the document type from the URL structure.

**Key Facts:**
- Only affects a few PDFs (not all)
- PDFs can be downloaded successfully in browser
- Most PDFs work fine with direct URL

## Solution: Base64 Fallback with Mistral

When Mistral rejects a URL, automatically:
1. Download the PDF using our improved fetch (with headers/retry)
2. Convert to base64
3. Retry with Mistral using data URL format: `data:application/pdf;base64,{base64content}`

## Implementation Plan

### 1. Modify OCR Processing Handler

**File:** `packages/api/src/handlers/ocr-processing.ts`

**Changes:**

1. **Add PDF Download Function** (after line 197)
```typescript
/**
 * Downloads PDF content from URL and converts to base64 data URL
 * Uses the improved fetchWithRetry for reliability
 */
async function downloadPdfAsBase64(pdfUrl: string): Promise<string> {
  const { response, lastError } = await fetchWithRetry(pdfUrl, TOTAL_TIMEOUT_MS);

  if (!response) {
    throw new Error(`Failed to download PDF: ${lastError || 'Network error'}`);
  }

  if (!response.ok) {
    throw new Error(`Failed to download PDF: HTTP ${response.status}`);
  }

  // Read response as buffer
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Size check
  if (buffer.length > MAX_PDF_BYTES) {
    throw new Error(`PDF too large: ${buffer.length} bytes`);
  }

  // Convert to base64 data URL
  const base64 = buffer.toString('base64');
  return `data:application/pdf;base64,${base64}`;
}
```

2. **Add Retry Logic for Mistral URL Errors** (around line 355, after `const ocr = await provider.extract({ pdfUrl });`)

Replace:
```typescript
const ocr = await provider.extract({ pdfUrl });
```

With:
```typescript
let ocr: OcrResult;
try {
  ocr = await provider.extract({ pdfUrl });
} catch (err) {
  // Check if this is Mistral's "cannot determine document type" error
  if (
    err instanceof OcrError &&
    err.category === 'VALIDATION' &&
    err.message.includes('Could not determine document type') &&
    provider.name === 'mistral'
  ) {
    // Fallback: Download PDF and retry with base64
    log('NETWORK_ERROR', {
      provider: provider.name,
      reason: 'mistral_url_rejected_retrying_base64',
      original_error: err.message
    });

    const base64DataUrl = await downloadPdfAsBase64(pdfUrl);

    // Retry with base64 data URL
    ocr = await provider.extract({ pdfUrl: base64DataUrl });
  } else {
    // Re-throw other errors
    throw err;
  }
}
```

### 2. Verify Mistral Provider Compatibility

**File:** `packages/api/src/services/ocr/mistral.ts`

**Verification Needed:**
- Confirm that line 86-87 accepts data URLs:
  ```typescript
  document: {
    type: 'document_url',
    document_url: input.pdfUrl  // Should accept data:application/pdf;base64,...
  }
  ```

**Expected:** No changes needed - Mistral API already supports data URLs in `document_url` field.

### 3. Update Environment Variables (Optional)

**File:** `.env`

Add optional configuration:
```bash
# Maximum PDF size for base64 encoding (default: 15MB)
MAX_PDF_BASE64_BYTES=15728640

# Enable detailed logging for fallback attempts
OCR_DEBUG=1
```

## Expected Behavior

### Normal Flow (Most PDFs)
```
1. Mistral receives URL: https://api.ciranet.com/...?EncryptedId=...
2. Mistral fetches and processes PDF
3. Returns OCR result
```

### Fallback Flow (Problematic PDFs)
```
1. Mistral receives URL: https://api.ciranet.com/...?EncryptedId=...
2. Mistral rejects with "Could not determine document type" (error 3310)
3. Lambda detects specific error
4. Lambda downloads PDF using improved fetch (with headers, retry, timeout=45s)
5. Lambda converts to base64: data:application/pdf;base64,{base64content}
6. Lambda retries Mistral with base64 data URL
7. Mistral processes and returns OCR result
```

## Benefits

✅ **No PDF left behind** - All PDFs get processed, even if URL is rejected
✅ **Minimal latency impact** - Only problematic PDFs take extra time
✅ **Uses existing infrastructure** - No need for Docling or additional services
✅ **Leverages improvements** - Uses our enhanced fetch with headers/retry/timeout
✅ **Transparent** - From user perspective, all PDFs just work

## Performance Impact

- **Normal PDFs**: No change (direct URL to Mistral)
- **Problematic PDFs**: +2-5 seconds (download + base64 encoding)
- **Memory**: Temporary spike during base64 encoding (max 15MB)

## Error Handling

If base64 fallback also fails:
- Error is logged with full details
- Original error is propagated to Step Functions
- Job marked as failed with clear error message

## Testing

### Test Cases

1. **Normal PDF** (URL ends with .pdf)
   - Should work with direct URL, no fallback

2. **Encrypted URL PDF** (no .pdf extension)
   - Should trigger fallback to base64
   - Should succeed with base64 retry

3. **Invalid/Corrupted PDF**
   - Should fail with clear error message
   - Should NOT trigger fallback (different error type)

4. **Very Large PDF** (>15MB)
   - Should fail at download stage
   - Clear error: "PDF too large"

### Manual Test Command
```bash
./run_batch_test.sh --limit 5
```

Monitor logs for:
- `mistral_url_rejected_retrying_base64` - Fallback triggered
- Successful completion after fallback

## Deployment

```bash
# Build and deploy
cd packages/infrastructure
pnpm deploy:dev

# Verify deployment
aws lambda get-function-configuration \
  --function-name CiraInvoice-Api-dev-OcrProcessingFunction403432BF-MjCIzLKWredq \
  --query 'LastUpdateStatus'

# Test
./run_batch_test.sh --limit 1
```

## Monitoring

Watch CloudWatch logs for:
```json
{
  "decision": "NETWORK_ERROR",
  "reason": "mistral_url_rejected_retrying_base64",
  "original_error": "mistral http error 400: Could not determine document type..."
}
```

Successful fallback should follow with:
```json
{
  "decision": "OK",
  "provider": "mistral",
  "retries": 1
}
```

## Rollback Plan

If issues occur:
1. Revert `ocr-processing.ts` changes
2. Redeploy: `pnpm deploy:dev`
3. Problematic PDFs will fail as before (known issue)

## Future Enhancements

1. **Cache base64 conversions** - Store base64 in S3 for repeated processing
2. **Parallel processing** - Download PDF while Mistral attempts URL
3. **Metrics** - Track fallback frequency and success rate
4. **Smart retry** - Learn which URL patterns need fallback, skip URL attempt

## References

- Mistral OCR API: https://docs.mistral.ai/capabilities/vision/
- Data URLs: https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URLs
- Base64 Encoding: https://nodejs.org/api/buffer.html#buffers-and-character-encodings
