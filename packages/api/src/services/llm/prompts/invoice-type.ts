/**
 * @fileoverview Invoice Type Classification Prompt Templates
 *
 * This module provides prompt templates for invoice type classification in the
 * two-stage LLM extraction pipeline. The prompts guide the LLM to categorize
 * invoices into one of four types: general, insurance, utility, or tax.
 *
 * Key Features:
 * - Clear classification rules and indicators for each invoice type
 * - Optimized for fast, accurate classification with minimal tokens
 * - JSON-only output for structured parsing
 * - Fallback to "general" for ambiguous cases
 *
 * Classification Strategy:
 * - Analyze document headers, labels, and terminology
 * - Identify type-specific indicators (policy numbers, service periods, tax years)
 * - Use explicit classification rules to minimize ambiguity
 * - Default to "general" when type cannot be confidently determined
 *
 * @version 1.0.0
 * @author CIRA Development Team
 * @since 2025-10-01
 */

import type { ChatMessage } from '../client';

/**
 * Builds optimized chat messages for invoice type classification.
 *
 * This function creates a focused conversation that guides the LLM to classify
 * the invoice into one of four types based on document content and structure.
 * The classification result determines which fields will be extracted in the
 * second stage of processing.
 *
 * Classification Logic:
 * - Analyze document headers, labels, and key terminology
 * - Look for type-specific indicators (policy numbers, service dates, tax years)
 * - Apply classification rules in order of specificity
 * - Default to "general" when ambiguous
 *
 * @param {string} markdown - OCR-extracted markdown text from invoice document
 * @returns {ChatMessage[]} Array of chat messages for LLM classification
 *
 * @example
 * ```typescript
 * const messages = buildInvoiceTypeClassificationPrompt(ocrMarkdown);
 * const result = await callLlm({ messages, schema: InvoiceTypeSchema });
 * console.log(result.data.invoice_type); // "insurance" | "utility" | "tax" | "general"
 * ```
 */
export function buildInvoiceTypeClassificationPrompt(markdown: string): ChatMessage[] {
  /**
   * System message establishing classification rules and invoice type indicators.
   */
  const system = `You are an invoice type classification assistant. Your task is to analyze invoice content and classify it into one of four types.

Invoice Types and Indicators:

1. **insurance**: Insurance policy invoices
   - Contains: "Policy Number", "Policy Period", "Coverage", "Premium", "Insured", "Policyholder"
   - Contains: "Policy Start Date", "Policy End Date", "Policy Expiration", "Renewal Date"
   - Contains: Insurance company names (e.g., State Farm, Allstate, Liberty Mutual, etc.)
   - Contains: Terms like "Liability", "Deductible", "Coverage Amount", "Carrier"

2. **utility**: Utility service invoices
   - Contains: "Service Period", "Meter Reading", "Usage", "kWh", "Therms", "Gallons", "CCF"
   - Contains: "Service Start Date", "Service End Date", "Billing Period"
   - Contains: Utility provider names (e.g., Electric Company, Water District, Gas Company)
   - Contains: Terms like "Current Charges", "Usage Charges", "Supply Charges", "Delivery Charges"
   - Contains: Account/meter numbers with service address

3. **tax**: Property tax invoices
   - Contains: "Tax Year", "Property Tax", "Assessment", "Parcel Number", "Parcel ID", "Property ID"
   - Contains: "Assessed Value", "Tax Roll", "Tax Bill", "County Tax", "Municipal Tax"
   - Contains: Government agency names (e.g., County Assessor, Tax Collector, Treasury)
   - Contains: Terms like "Levy", "Mill Rate", "Assessment District"

4. **general**: Standard vendor invoices (default)
   - Standard commercial invoices without specialized fields above
   - Generic vendor/supplier invoices for goods or services
   - Invoices that don't clearly fit insurance, utility, or tax categories

Classification Rules:
- Analyze the document for type-specific indicators listed above
- If multiple types match, choose the most specific type based on primary purpose
- If no clear indicators present, classify as "general"
- Be conservative: only classify as specialized type if clear indicators exist

Output Requirements:
- Respond with ONLY a raw JSON object
- Do NOT use markdown code fences (\`\`\`json)
- Do NOT include explanatory text before or after the JSON
- Format: {"invoice_type": "general"|"insurance"|"utility"|"tax"}
- Start your response directly with { and end with }
`;

  /**
   * User message providing the classification task and OCR content.
   */
  const user = `Classify the following invoice document into one of these types: general, insurance, utility, or tax.

Analyze the content and determine the invoice type based on the classification rules.

--- OCR START ---
${markdown}
--- OCR END ---

Return your classification as a JSON object with a single field "invoice_type".`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
}
