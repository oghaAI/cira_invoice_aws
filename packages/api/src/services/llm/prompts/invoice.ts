/**
 * @fileoverview Invoice Extraction Prompt Templates
 *
 * This module provides carefully crafted prompt templates for structured invoice data extraction
 * using Large Language Models. The prompts are optimized for accuracy, consistency, and
 * adherence to the defined schema structure with reasoning and confidence scoring.
 *
 * Key Features:
 * - System prompts that establish clear extraction guidelines
 * - User prompts that provide context and specific instructions
 * - Optimized for factual extraction without hallucination
 * - Designed for JSON output with structured schema compliance
 * - Clear delineation between input content and instructions
 *
 * Prompt Engineering Principles:
 * - Clear role definition for the AI assistant
 * - Explicit instructions to prevent hallucination
 * - Structured output requirements with schema compliance
 * - Factual extraction emphasis over inference
 * - Proper handling of missing or unclear information
 *
 * @version 1.0.0
 * @author CIRA Development Team
 * @since 2025-09-15
 */

import type { ChatMessage } from '../client';

/**
 * Builds optimized chat messages for invoice data extraction from OCR markdown.
 *
 * This function creates a carefully structured conversation that guides the LLM
 * to extract invoice data accurately while following the InvoiceSchema structure.
 * The prompt emphasizes factual extraction and proper handling of missing data.
 *
 * Prompt Design Features:
 * - System message establishes extraction principles and guidelines
 * - User message provides clear task definition and input delineation
 * - Emphasis on factual extraction without inference or hallucination
 * - JSON-only output requirement for structured data
 * - Clear boundaries around input content to prevent confusion
 *
 * @param {string} markdown - OCR-extracted markdown text from invoice document
 * @returns {ChatMessage[]} Array of chat messages for LLM conversation
 *
 * @example
 * ```typescript
 * const messages = buildInvoiceExtractionPrompt(ocrMarkdown);
 * const result = await callLlm({ messages, schema: InvoiceSchema });
 * ```
 */
export function buildInvoiceExtractionPrompt(markdown: string): ChatMessage[] {
  /**
   * System message establishing the AI assistant's role and extraction principles.
   * This sets the foundation for accurate, factual extraction without hallucination.
   */
  const system = `You are a precise invoice extraction assistant.

 - Core disambiguation rules:
  - Dates: "Invoice Date" → invoice_date; "Due Date" → invoice_due_date; ignore unrelated dates; if text is non-date (e.g., "Due upon receipt"), set invoice_due_date = null.
  - Label proximity: when multiple candidates exist, choose the closest value to the label; if still conflicting, set the field to null with confidence="low" and include evidence_snippet.
  - Confidence: use "high" only with explicit labels; otherwise "medium" for strong nearby context; set null + "low" when ambiguous or missing.
  - Missing values: never infer; set null (or [] for lists) and include evidence_snippet when applicable.

- User output directive:
  - Respond with ONLY a raw JSON object. Do NOT use markdown code fences (${'```json'}). Do NOT include any explanatory text before or after the JSON.
  - Each field must be a nested object with this structure:
    "field_name": {
      "value": <actual_value>,
      "confidence": "low"|"medium"|"high",
      "reason_code": "explicit_label"|"nearby_header"|"inferred_layout"|"conflict"|"missing",
      "evidence_snippet": "text from document" (optional),
      "reasoning": "brief explanation" (optional),
      "assumptions": ["assumption1", "assumption2"] (optional, must be array)
    }
  - Start your response directly with { and end with }. Nothing else.

- Community name disambiguation:
  - Prefer labels like "Community", "Association", "HOA", "Property", "Subdivision"; avoid "Vendor", "Management Company", "Remit To".
  - Prefer names near service address/account identifiers or in header/title blocks; avoid footer/remittance areas.
  - Exclude management companies (e.g., names with Inc., LLC, Management, Services and corporate contact blocks) and bank lockboxes.
  - If multiple properties/communities appear, set value to null and include evidence_snippet; do not guess.
  - If a candidate equals vendor_name, treat as vendor unless labeled as Association/HOA.

- Financial extraction rules:
  - Mapping:
    - total_amount_due: "Total amount you owe", "Balance Due", "Amount Due", "Total due", "Amount owed"
    - invoice_current_due_amount: "Total new charges", "Current charges", "New charges"
    - invoice_past_due_amount: "Past due", "Previous balance", "Overdue" (prefer "Past due" if both appear)
    - invoice_late_fee_amount: "Late fee", "Penalty", "Finance charge"
    - credit_amount: "Credit", "Refund", "Payment applied"
  - Precedence & tie-breakers:
    - If only one "total" amount exists → total_amount_due (not invoice_current_due_amount)
    - Use explicit "current/new charges" labels for invoice_current_due_amount
    - total_amount_due is the final amount after adjustments; do not overwrite it with current/new charges
    - Prefer header/body totals over remittance stub/coupon amounts
  - Payments vs credits:
    - Treat "Payment received" / "Payment applied" as a payment; if no dedicated payments field exists, use credit_amount
  - Numeric normalization:
    - Strip currency symbols and thousands separators; parse as numbers
    - Parentheses indicate negative amounts (e.g., "($25.00)" → -25.00)

- Community name via Bill To:
  - Bill To is a valid community_name candidate only if it clearly denotes an HOA/Association/Community (e.g., contains “HOA”, “Association”, “POA”, “COA”, “Community”).
  - Exclude Bill To entries that are persons (“Attn: …”), residents/units, or management companies (e.g., Inc., LLC, “Management”, “Services”).
  - Prefer a Bill To community when it aligns with the service address context; otherwise prefer header/title community.
  - If multiple or conflicting Bill To candidates exist, set value to null and include evidence_snippet.

- Vendor vs remittance:
  - vendor_name: the issuer of the invoice. payment_remittance_*: the payee/address to remit payment; they may differ.
  - Remittance indicators include: "Remit To", "Lockbox", "PO Box", "Attn: Lockbox", bank routing/ACH blocks.
  - Do not use remittance block names/addresses for vendor_name.

- Emission policy:
  - reason_code: always include.
  - evidence_snippet: include only when confidence ≠ 'high' OR the value is null/ambiguous.
  - reasoning: include only in the same cases; keep ≤120 chars, no chain-of-thought.
  - assumptions: include only when a policy/default was applied (e.g., US date interpretation), or ambiguity was resolved.

- Date sanity:
  - If invoice_due_date is earlier than invoice_date, set the affected date(s) to null and include evidence_snippet; do not guess or correct.
  - If due text is non-date like "Due upon receipt", set invoice_due_date to null and include evidence_snippet.
  - Relative due dates:
    - If explicit terms like "Net N", "N days from invoice date", or "Due in N days" appear and invoice_date is present/parseable, compute invoice_due_date = invoice_date + N days (YYYY-MM-DD). Include evidence_snippet and note calculation in assumptions.
    - If such terms appear but invoice_date is missing/unparseable, set invoice_due_date to null and include evidence_snippet; do not guess the date.

- Confidence guidance:
  - high: explicit label next to the value (e.g., “Invoice Date”, “Due Date”, “Total Due”).
  - medium: nearby header/context supports the value but not explicitly labeled.
  - low: competing candidates or weak cues (set value to null if ambiguous).
  - If a field is missing or ambiguous, set its value to null (or [] for lists) and confidence to "low". Do not invent values.

- reason_code: must be one of ["explicit_label", "nearby_header", "inferred_layout", "conflict", "missing"]. If unsure, use "missing".

`;
  /**
   * User message providing the specific extraction task and input content.
   * Clear delineation prevents the LLM from treating instructions as content.
   */
  const user = `Extract structured invoice data per the rules. Return a single JSON object that matches the schema.

--- OCR START ---
${markdown}
--- OCR END ---`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
}
