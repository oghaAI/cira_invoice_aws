const { extractInvoiceWithTypeDetection } = require('../packages/api/dist/services/llm/client.js');

function jsonStringifyOrNull(value) {
  if (value === null || value === undefined) return '<none>';
  try {
    return JSON.stringify(value, null, 2);
  } catch (err) {
    return `<unserializable: ${err instanceof Error ? err.message : String(err)}>`;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const shouldPrintMessages = args[0] === '--print-messages';
  const markdown = shouldPrintMessages ? args.slice(1).join(' ') : args.join(' ');
  if (!markdown) {
    console.error('Usage: node scripts/test-llm.js "<markdown>"');
    console.error('Example: node scripts/test-llm.js --print-messages "<invoice markdown text>"');
    process.exit(1);
  }

  console.log('=== TWO-STAGE INVOICE EXTRACTION ===\n');
  console.log('Stage 1: Classifying invoice type...');
  console.log('Stage 2: Extracting type-specific fields...\n');

  try {
    const result = await extractInvoiceWithTypeDetection(markdown);

    console.log('--- INVOICE TYPE ---');
    console.log(`Classified as: ${result.invoiceType}`);

    console.log('\n--- EXTRACTED DATA ---');
    console.log(jsonStringifyOrNull(result.data));

    console.log('\n--- METADATA ---');
    console.log(`Confidence Score: ${result.confidence?.toFixed(3) ?? 'N/A'}`);
    console.log(`Tokens Used (Extraction): ${result.tokensUsed ?? 'N/A'}`);
    console.log(`Total Tokens (Both Stages): ${result.totalTokensUsed ?? 'N/A'}`);

    console.log('\n--- FIELD SUMMARY ---');
    const fields = Object.entries(result.data || {});
    console.log(`Total fields extracted: ${fields.length}`);

    const highConfidence = fields.filter(([_, v]) => v?.confidence === 'high').length;
    const mediumConfidence = fields.filter(([_, v]) => v?.confidence === 'medium').length;
    const lowConfidence = fields.filter(([_, v]) => v?.confidence === 'low').length;

    console.log(`  High confidence: ${highConfidence}`);
    console.log(`  Medium confidence: ${mediumConfidence}`);
    console.log(`  Low confidence: ${lowConfidence}`);

    console.log('\n✅ Extraction completed successfully!');

  } catch (error) {
    console.error('\n❌ Extraction failed:');
    console.error(error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main().catch(err => {
  console.error('ERROR', err);
  process.exit(1);
});
