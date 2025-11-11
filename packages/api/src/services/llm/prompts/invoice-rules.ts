/**
 * @fileoverview Shared Invoice Extraction Rules Library
 *
 * This module provides reusable prompt rule fragments for structured invoice data extraction
 * across all invoice types. By centralizing common extraction rules, we ensure consistency
 * across type-specific prompts while reducing duplication and maintenance burden.
 *
 * Key Features:
 * - Modular rule components that can be composed into type-specific prompts
 * - Comprehensive financial field extraction with label mappings and precedence rules
 * - Date disambiguation rules to prevent confusing invoice/due/policy/service dates
 * - Vendor vs remittance separation to correctly identify payment destinations
 * - Community name disambiguation to avoid confusing HOAs with management companies
 * - Output structure requirements for ReasonedField format compliance
 * - Confidence scoring guidance for transparent extraction quality assessment
 *
 * Architecture:
 * - Each rule category is exported as a string constant
 * - Type-specific prompts import and compose these rules
 * - Rules are designed to work independently or in combination
 * - Includes examples and edge case handling guidance
 *
 * Usage:
 * ```typescript
 * import { FINANCIAL_RULES, DATE_RULES, OUTPUT_STRUCTURE } from './invoice-rules';
 *
 * const systemPrompt = `You are an invoice extraction assistant.
 * ${FINANCIAL_RULES}
 * ${DATE_RULES}
 * ${OUTPUT_STRUCTURE}`;
 * ```
 *
 * @version 1.0.0
 * @author CIRA Development Team
 * @since 2025-11-02
 */

/**
 * Core disambiguation rules for common extraction challenges.
 *
 * These rules address the most frequent ambiguity scenarios in invoice extraction:
 * - Multiple dates with different meanings (invoice vs due vs coverage)
 * - Label proximity when multiple candidates exist for a field
 * - Handling of missing or non-standard values
 *
 * The rules establish a consistent approach to confidence scoring and evidence tracking
 * that applies across all field types.
 */
export const CORE_DISAMBIGUATION_RULES = `- Core disambiguation rules:
  - Dates: "Invoice Date" → invoice_date; "Due Date" → invoice_due_date; ignore unrelated dates; if text is non-date (e.g., "Due upon receipt"), set invoice_due_date = null.
  - Label proximity: when multiple candidates exist, choose the closest value to the label; if still conflicting, set the field to null with confidence=\"low\" and include evidence_snippet.
  - Confidence: use "high" only with explicit labels; otherwise "medium" for strong nearby context; set null + "low" when ambiguous or missing.
  - Missing values: never infer; set null (or [] for lists) and include evidence_snippet when applicable.`;

/**
 * Output structure and format requirements for LLM responses.
 *
 * This section is critical for ensuring the LLM produces JSON that:
 * - Can be parsed without markdown stripping
 * - Matches the ReasonedField schema structure
 * - Includes all required metadata (confidence, reason_code)
 * - Follows character limits for reasoning and evidence
 *
 * The strict "no markdown fences" directive addresses a common LLM behavior
 * where models wrap JSON in ```json blocks despite instructions.
 */
export const OUTPUT_STRUCTURE = `- User output directive:
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
  - Start your response directly with { and end with }. Nothing else.`;

/**
 * Community name extraction and disambiguation rules.
 *
 * Community name extraction is particularly challenging because:
 * - Invoices often contain both HOA names and management company names
 * - "Bill To" blocks may contain either the community or the management company
 * - Footer remittance areas should be excluded
 * - Multiple properties may appear on a single invoice
 *
 * These rules establish a priority order:
 * 1. Prefer labels like "Community", "Association", "HOA"
 * 2. Prefer header/title locations over footer areas
 * 3. Exclude management companies (Inc., LLC, Management Services)
 * 4. Use service address context as supporting evidence
 */
export const COMMUNITY_NAME_RULES = `- Community name disambiguation:
  - Prefer labels like "Community", "Association", "HOA", "Property", "Subdivision", "Condo"; avoid "Vendor", "Management Company", "Remit To".
  - Prefer names near service address/account identifiers or in header/title blocks; avoid footer/remittance areas.
  - Exclude management companies (e.g., names with Inc., LLC, Management, Services and corporate contact blocks) and bank lockboxes.
  - If multiple properties/communities appear, set value to null and include evidence_snippet; do not guess.
  - If a value has been identified as vendor_name, it CANNOT also be community_name

  `;

/**
 * Community name extraction via "Bill To" blocks.
 *
 * The "Bill To" field is a valid community name source ONLY when it clearly
 * denotes an HOA/Association/Community entity. This rule prevents extracting:
 * - Individual persons ("Attn: John Smith")
 * - Resident/unit identifiers
 * - Management company names
 *
 * The rule establishes preference order when multiple "Bill To" candidates exist
 * and alignment checks with service address context.
 */
export const COMMUNITY_BILL_TO_RULES = `- Community name via Bill To or Billing Contact:
  - Bill To is a valid community_name candidate only if it clearly denotes an HOA/Association/Community/Condo (e.g., contains "HOA", "Association", "POA", "COA", "Community", "Condo").
  - Exclude Bill To entries that are persons ("Attn: …"), residents/units, or management companies (e.g., Inc., LLC, "Management", "Services").
  - Prefer a Bill To community when it aligns with the service address context; otherwise prefer header/title community.
  - If multiple or conflicting Bill To candidates exist, set value to null and include evidence_snippet.`;

/**
 * Vendor vs remittance entity separation rules.
 *
 * Critical distinction:
 * - vendor_name: The company that issued the invoice (the service provider)
 * - payment_remittance_*: Where to send payment (may be a lockbox, bank, or different entity)
 *
 * Many invoices are issued by Company A but payments go to Company B (their bank,
 * a lockbox service, or a parent company). These rules prevent confusing the two.
 *
 * Remittance indicators include:
 * - "Remit To" or "Mail Payment To" labels
 * - Lockbox addresses (PO Box with "Lockbox" mention)
 * - Bank routing/ACH information blocks
 * - "Attn: Lockbox" or similar payment processing addresses
 */
export const VENDOR_REMITTANCE_RULES = `- Vendor vs remittance:
  - vendor_name: the issuer of the invoice. payment_remittance_*: the payee/address to remit payment; they may differ.
  - Remittance indicators include: "Remit To", "Lockbox", "PO Box", "Attn: Lockbox", bank routing/ACH blocks.
  - Do not use remittance block names/addresses for vendor_name.`;

/**
 * Financial field extraction rules with label mappings and precedence.
 *
 * Financial amounts are the most critical fields for invoice processing. These rules
 * establish clear mappings between invoice labels and schema fields, plus precedence
 * rules when multiple amounts could map to the same field.
 *
 * Key challenges addressed:
 * - Multiple "total" amounts (header total vs remittance stub total)
 * - Distinguishing current charges from total amount due
 * - Payments vs credits (semantically similar but different fields)
 * - Negative amounts indicated by parentheses
 * - Currency symbol and thousands separator normalization
 *
 * Precedence rules prevent overwriting total_amount_due with current charges,
 * which is a common extraction error when both appear on an invoice.
 */
export const FINANCIAL_RULES = `- Financial extraction rules:
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
    - Parentheses indicate negative amounts (e.g., "($25.00)" → -25.00)`;

/**
 * Date field extraction and sanity checking rules.
 *
 * Date handling is complex due to:
 * - Multiple date formats (MM/DD/YYYY, DD/MM/YYYY, "Month DD, YYYY")
 * - Non-date text in due date fields ("Due upon receipt", "Net 30")
 * - Relative due dates computed from invoice date
 * - Invalid date sequences (due date before invoice date)
 *
 * The sanity check prevents extracting impossible date combinations but doesn't
 * try to "fix" them - instead it nulls the affected fields and includes evidence
 * for manual review.
 *
 * Relative date computation handles common payment terms like "Net 30" or
 * "Due in 15 days" by calculating the actual due date from the invoice date.
 */
export const DATE_SANITY_RULES = `- Date sanity:
  - If invoice_due_date is earlier than invoice_date, set the affected date(s) to null and include evidence_snippet; do not guess or correct.
  - If due text is non-date like "Due upon receipt", set invoice_due_date to null and include evidence_snippet.
  - Relative due dates:
    - If explicit terms like "Net N", "N days from invoice date", or "Due in N days" appear and invoice_date is present/parseable, compute invoice_due_date = invoice_date + N days (YYYY-MM-DD). Include evidence_snippet and note calculation in assumptions.
    - If such terms appear but invoice_date is missing/unparseable, set invoice_due_date to null and include evidence_snippet; do not guess the date.`;

/**
 * Confidence level guidance for extraction quality assessment.
 *
 * Confidence scoring provides transparency into extraction quality:
 * - high: Explicitly labeled field with clear, unambiguous value
 * - medium: Strong contextual evidence but not explicitly labeled
 * - low: Weak evidence, multiple candidates, or missing data
 *
 * This guidance ensures consistent confidence scoring across all fields and
 * invoice types. The rule to set null + low confidence for ambiguous fields
 * prevents the LLM from guessing when it shouldn't.
 */
export const CONFIDENCE_GUIDANCE = `- Confidence guidance:
  - high: explicit label next to the value (e.g., "Invoice Date", "Due Date", "Total Due") OR field is clearly absent from the invoice (high confidence it's null).
  - medium: nearby header/context supports the value but not explicitly labeled.
  - low: competing candidates, weak cues, or uncertain about which value is correct (set value to null if ambiguous).
  - If a field is clearly missing from the invoice, set value to null with confidence="high" and reason_code="missing". If ambiguous or uncertain, set value to null with confidence="low" and include evidence_snippet. Do not invent values.`;

/**
 * Emission policy for optional metadata fields.
 *
 * To keep responses concise and reduce token usage, this policy specifies when
 * to include optional metadata:
 * - reason_code: Always included (helps debugging and quality assessment)
 * - evidence_snippet: Only when confidence is not high OR value is null/ambiguous
 * - reasoning: Same conditions as evidence_snippet; limited to 120 chars
 * - assumptions: Only when a policy/default was applied or ambiguity resolved
 *
 * The reasoning character limit prevents verbose chain-of-thought explanations
 * that waste tokens and slow down processing.
 */
export const EMISSION_POLICY = `- Emission policy:
  - reason_code: always include.
  - evidence_snippet: include only when confidence ≠ 'high' OR the value is null/ambiguous.
  - reasoning: include only in the same cases; keep ≤120 chars, no chain-of-thought.
  - assumptions: include only when a policy/default was applied (e.g., US date interpretation), or ambiguity was resolved.`;

/**
 * Reason code enumeration and usage guidance.
 *
 * The reason_code field categorizes the extraction method:
 * - explicit_label: Field found with clear label ("Invoice Date: 01/15/2025")
 * - nearby_header: Field inferred from nearby section header or context
 * - inferred_layout: Field position/layout suggests its meaning
 * - conflict: Multiple conflicting candidates found
 * - missing: Field not found in document
 *
 * "missing" is the fallback when unsure, preventing forced categorization
 * into inappropriate buckets.
 */
export const REASON_CODE_GUIDANCE = `- reason_code: must be one of ["explicit_label", "nearby_header", "inferred_layout", "conflict", "missing"]. If unsure, use "missing".`;

/**
 * Identifier field extraction rules.
 *
 * Invoice numbers, account numbers, and policy numbers are critical for tracking
 * and reference. These rules establish:
 * - Label preference orders when multiple candidates exist
 * - Common label variations and prefixes
 * - Disambiguation when multiple identifier types appear
 *
 * The preference order prevents extracting account numbers as invoice numbers
 * or reference numbers as invoice numbers when both are present.
 */
export const IDENTIFIER_RULES = `- Identifier field extraction:
  - invoice_number: Prefer "Invoice #", "Invoice No.", "Invoice Number" over "Reference #", "Bill #", "Confirmation #". May include prefixes (INV-, #, etc.).
  - account_number: Look for "Account #", "Account No.", "Acct No.", "Customer #", "Client ID", "Customer Number".
  - policy_number: Look for "Policy #", "Policy No.", "Policy Number", "Coverage #" (insurance invoices only).
  - When multiple identifiers exist, use label proximity and explicit labeling to disambiguate.`;

/**
 * Payment remittance field extraction rules.
 *
 * Payment remittance information tells the payer where to send payment:
 * - payment_remittance_entity: The company/organization name
 * - payment_remittance_entity_care_of: The "c/o" or "Attn:" line
 * - payment_remittance_address: Full mailing address
 *
 * Multi-line address handling is critical - invoices often present addresses as:
 *   Remit To:
 *   Acme Corporation
 *   PO Box 12345
 *   City, ST 12345
 *
 * The rule specifies combining these into a single string with proper formatting.
 */
export const PAYMENT_REMITTANCE_RULES = `- Payment remittance field extraction:
  - payment_remittance_entity: Company name in "Remit To", "Mail Payment To", "Send Payment To" block. May differ from vendor_name.
  - payment_remittance_entity_care_of: Look for "c/o", "Attn:", "Attention:", "Care of" lines in remittance block.
  - payment_remittance_address: Full address from remittance block. Combine multi-line addresses into single string: "Street, City, State ZIP" format. Include all components: street, city, state, zip code.`;

/**
 * Document validation rules for valid_input field.
 *
 * The valid_input boolean indicates whether the document is a processable invoice.
 * This prevents attempting to extract from:
 * - Receipts (already paid, different purpose)
 * - Quotes/estimates (not yet authorized)
 * - Statements (summary, not a bill)
 * - Promotional materials, catalogs, etc.
 *
 * Minimum criteria for a valid invoice:
 * - Must have a vendor/issuer name
 * - Must have either an invoice number OR a total amount due
 *
 * If these minimum fields are missing, the document likely isn't an invoice.
 */
export const DOCUMENT_VALIDATION_RULES = `- Document validation (valid_input field):
  - Set valid_input = true if the document appears to be a processable invoice with: vendor_name present AND (invoice_number OR total_amount_due present).
  - Set valid_input = false if the document is: a receipt, quote, estimate, statement, promotional material, or missing core invoice fields.
  - Include evidence_snippet if valid_input = false to explain why document is invalid.`;

/**
 * General reasoning field guidance.
 *
 * The 'reasoning' field (distinct from per-field 'reasoning') captures:
 * - Overall document quality assessment
 * - Extraction challenges encountered
 * - Ambiguities that affected multiple fields
 * - OCR quality issues
 * - Unusual document layout or format
 *
 * Important: The 'reasoning' field follows the same ReasonedField structure as all other fields,
 * with value, confidence, and reason_code nested properties. It is NOT a plain string at root level.
 *
 * This provides valuable context for downstream processing and manual review
 * when confidence is low.
 */
export const GENERAL_REASONING_GUIDANCE = `- General reasoning field:
  - The 'reasoning' field follows the same nested structure as all other fields: { value, confidence, reason_code, ... }
  - Set reasoning.value to overall document quality notes, extraction challenges, or widespread ambiguities.
  - Examples: "OCR quality poor in amount fields", "Multiple properties listed, unclear which is primary", "Unusual layout with amounts in footer only".
  - Keep reasoning.value concise (≤120 chars), focus on document-level issues rather than field-specific issues.
  - Set reasoning.confidence based on certainty of the document assessment.`;
