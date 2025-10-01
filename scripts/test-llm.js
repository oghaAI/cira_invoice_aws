const { generateObject } = require('ai');
const { createAzure: createAzureOpenAI } = require('@ai-sdk/azure');
const { createAzure: createAzureCustom } = require('@quail-ai/azure-ai-provider');

const { getLlmClient } = require('../packages/api/dist/services/llm/client.js');
const { InvoiceSchema } = require('../packages/api/dist/services/llm/schemas/invoice.js');
const { buildInvoiceExtractionPrompt } = require('../packages/api/dist/services/llm/prompts/invoice.js');

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
    process.exit(1);
  }

  const messages = buildInvoiceExtractionPrompt(markdown);

  if (shouldPrintMessages) {
    console.log('--- Messages ---');
    console.dir(messages, { depth: null });
    console.log('--- End Messages ---\n');
  }
  const { modelId, config } = getLlmClient();

  let modelFactory;
  if (config.mode === 'azure-custom') {
    modelFactory = createAzureCustom({ endpoint: config.endpoint, apiKey: config.apiKey });
  } else {
    modelFactory = createAzureOpenAI({
      resourceName: config.resourceName,
      apiKey: config.apiKey,
      apiVersion: config.apiVersion,
      useDeploymentBasedUrls: config.useDeploymentUrls
    });
  }

  const model = modelFactory(modelId);

  const result = await generateObject({
    model,
    messages,
    schema: InvoiceSchema,
    experimental_telemetry: { isEnabled: true }
  });

  console.log('--- Request Body ---');
  console.log(jsonStringifyOrNull(result.request?.body));

  console.log('\n--- Response Body ---');
  console.log(jsonStringifyOrNull(result.response?.body));

  console.log('\n--- Parsed Object ---');
  console.dir(result.object, { depth: null });

  console.log('\n--- Usage ---');
  console.dir(result.usage, { depth: null });
}

main().catch(err => {
  console.error('ERROR', err);
  process.exit(1);
});
