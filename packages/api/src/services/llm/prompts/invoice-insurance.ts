/**
 * @fileoverview Insurance Invoice Extraction Prompt Templates
 *
 * This module provides prompt templates for extracting structured data from insurance
 * policy invoices in the CIRA Invoice Processing System. Insurance invoices include
 * specialized fields for policy coverage periods, policy numbers, and service termination
 * that are not present in general vendor invoices.
 *
 * Field Coverage (21 fields = 17 base + 4 insurance-specific):
 * - Base fields: All general invoice fields (dates, identifiers, financials, entities)
 * - Insurance-specific fields:
 *   - policy_start_date: Policy effective/coverage start date
 *   - policy_end_date: Policy expiration/coverage end date
 *   - policy_number: Policy identifier (distinct from invoice/account number)
 *   - service_termination: Whether policy is being cancelled/terminated
 *
 * Key Features:
 * - Focused extraction rules for insurance policy invoices
 * - Policy date disambiguation from invoice/billing dates
 * - Policy number identification and validation
 * - Cancellation/termination detection patterns
 * - Coverage period extraction and validation
 * - Premium billing terminology handling
 *
 * Common Insurance Invoice Patterns:
 * - Policy dates often appear as "Policy Period: MM/DD/YYYY - MM/DD/YYYY"
 * - Policy numbers may have prefixes (POL-, Policy #, Coverage #)
 * - Termination indicators: "Cancellation Notice", "Policy Terminated", "Coverage Ended"
 * - Amounts may be labeled "Premium", "Total Premium Due", "Policy Premium"
 *
 * Prompt Design:
 * - Extends general invoice rules with insurance-specific field extraction
 * - Adds policy date vs billing date disambiguation
 * - Includes termination pattern detection
 * - Maintains consistency with shared rules from invoice-rules.ts
 *
 * Usage:
 * ```typescript
 * const messages = buildInsuranceInvoicePrompt(ocrMarkdown);
 * const schema = buildInvoiceSchemaForType('insurance');
 * const result = await callLlm({ messages, schema });
 * ```
 *
 * @version 1.0.0
 * @author CIRA Development Team
 * @since 2025-11-02
 */

import type { ChatMessage } from '../client';
import {
  CORE_DISAMBIGUATION_RULES,
  OUTPUT_STRUCTURE,
  COMMUNITY_NAME_RULES,
  COMMUNITY_BILL_TO_RULES,
  VENDOR_REMITTANCE_RULES,
  FINANCIAL_RULES,
  DATE_SANITY_RULES,
  CONFIDENCE_GUIDANCE,
  EMISSION_POLICY,
  REASON_CODE_GUIDANCE,
  IDENTIFIER_RULES,
  PAYMENT_REMITTANCE_RULES,
  DOCUMENT_VALIDATION_RULES,
  GENERAL_REASONING_GUIDANCE
} from './invoice-rules.js';

/**
 * Insurance-specific field extraction rules.
 *
 * These rules address the unique challenges of insurance invoice extraction:
 *
 * 1. Policy Date Disambiguation:
 *    - Policy dates define the coverage period (what's insured and when)
 *    - Invoice dates define when the bill was issued
 *    - Due dates define when payment is required
 *    - All three can appear on the same document with different values
 *
 * 2. Policy Number Identification:
 *    - May be labeled "Policy #", "Policy No.", "Policy Number", "Coverage #"
 *    - Often has prefixes or formatting (POL-12345, #POL12345)
 *    - Must be distinguished from invoice number and account number
 *    - Usually appears near policyholder information or coverage details
 *
 * 3. Service Termination Detection:
 *    - Indicates policy cancellation or non-renewal
 *    - Critical for downstream processing (no auto-renewal, final bill)
 *    - Common patterns: "Cancellation Notice", "Policy Terminated", "Coverage Ended"
 *    - May appear as "Final Bill" or "Non-Renewal Notice"
 *
 * 4. Coverage Period Extraction:
 *    - Often presented as a range: "01/01/2025 - 12/31/2025"
 *    - May be split across two fields: "Effective Date" and "Expiration Date"
 *    - Should validate that end date is after start date
 *    - Renewal invoices may show both current and next period
 */
export const INSURANCE_SPECIFIC_RULES = `- Insurance-specific field extraction:
  - policy_start_date: Look for "Policy Effective Date", "Coverage Begins", "Effective From", "Policy Period Start", "Coverage Start Date". This is when the insurance coverage starts, NOT the invoice date.
  - policy_end_date: Look for "Policy Expiration", "Coverage Ends", "Expires", "Policy Period End", "Coverage End Date", "Renewal Date". This is when coverage expires.
  - policy_number: Look for "Policy #", "Policy No.", "Policy Number", "Coverage #", "Policy ID". Usually appears near policyholder/insured information. May include prefixes (POL-, #). Distinct from invoice_number and account_number.
  - service_termination: Set to true if document indicates policy cancellation or termination. Look for "Cancellation Notice", "Policy Terminated", "Coverage Ended", "Non-Renewal", "Final Bill", "Policy Cancelled". Set to false if no termination indicators present. Set to null if unclear.

- Policy date disambiguation:
  - Policy dates (policy_start_date, policy_end_date) define the coverage period - when the insurance is active.
  - Invoice date (invoice_date) is when the bill was generated - usually at the start of coverage period or renewal.
  - Due date (invoice_due_date) is when payment must be received.
  - All three are different dates with different meanings - do not confuse them.
  - If a date range appears near "Policy Period" or "Coverage Period", extract start → policy_start_date, end → policy_end_date.
  - Validate: policy_end_date should be after policy_start_date. If not, set both to null with evidence_snippet.

- Policy number validation:
  - Policy number is typically alphanumeric, may contain dashes or prefixes.
  - If multiple numbers appear, prefer the one explicitly labeled "Policy" over "Invoice" or "Account".
  - If document has both policy_number and invoice_number, they should be different values. If they appear identical, review labels carefully.`;

/**
 * Builds optimized chat messages for insurance invoice data extraction.
 *
 * This function creates a focused conversation that guides the LLM to extract
 * both base vendor invoice fields AND insurance-specific fields (policy dates,
 * policy number, service termination).
 *
 * The prompt composition strategy:
 * 1. Start with core disambiguation and output structure (foundation)
 * 2. Add entity and financial rules (common to all invoices)
 * 3. Add identifier and payment rules (common to all invoices)
 * 4. Add INSURANCE-SPECIFIC RULES (policy dates, policy number, termination)
 * 5. Add validation and metadata policies (quality control)
 *
 * Why insurance-specific prompts matter:
 * - Policy date extraction requires specific label mapping and disambiguation
 * - Policy numbers must be distinguished from invoice/account numbers
 * - Termination detection affects downstream processing workflows
 * - Insurance terminology differs from standard vendor invoices
 *
 * Token efficiency:
 * - Only includes insurance-specific rules (not utility or tax rules)
 * - Reduces prompt size by ~25% compared to unified prompt with all types
 * - Improves LLM focus by eliminating irrelevant field guidance
 *
 * @param {string} markdown - OCR-extracted markdown text from insurance invoice
 * @returns {ChatMessage[]} Array of chat messages for LLM conversation
 *
 * @example
 * ```typescript
 * const messages = buildInsuranceInvoicePrompt(ocrMarkdown);
 * // Use with insurance invoice schema (17 base + 4 insurance fields)
 * const schema = buildInvoiceSchemaForType('insurance');
 * const result = await callLlm({ messages, schema });
 * // Result contains base fields + policy_start_date, policy_end_date,
 * // policy_number, service_termination
 * ```
 */
export function buildInsuranceInvoicePrompt(markdown: string): ChatMessage[] {
  /**
   * System message establishing extraction principles for insurance invoices.
   *
   * Rule ordering rationale:
   * 1. Core rules (disambiguation, output) - foundation for all extraction
   * 2. Entity rules (community, vendor) - identify who/what is insured
   * 3. Financial rules - premium amounts, billing details
   * 4. Date rules - critical for insurance due to policy vs billing dates
   * 5. Identifier rules - account, invoice, and policy number disambiguation
   * 6. Payment rules - remittance processing
   * 7. INSURANCE-SPECIFIC - policy dates, termination detection (key differentiator)
   * 8. Validation & metadata - quality control and confidence scoring
   *
   * The insurance-specific rules are placed after general identifier rules so
   * the LLM first understands the general pattern (invoice# vs account#) before
   * learning the insurance-specific pattern (policy# as third identifier type).
   */
  const system = `You are a precise insurance invoice extraction assistant.

${CORE_DISAMBIGUATION_RULES}

${OUTPUT_STRUCTURE}

${COMMUNITY_NAME_RULES}

${COMMUNITY_BILL_TO_RULES}

${VENDOR_REMITTANCE_RULES}

${FINANCIAL_RULES}

${DATE_SANITY_RULES}

${IDENTIFIER_RULES}

${PAYMENT_REMITTANCE_RULES}

${INSURANCE_SPECIFIC_RULES}

${DOCUMENT_VALIDATION_RULES}

${GENERAL_REASONING_GUIDANCE}

${CONFIDENCE_GUIDANCE}

${EMISSION_POLICY}

${REASON_CODE_GUIDANCE}
`;

  /**
   * User message providing extraction task and OCR content.
   *
   * Clear delineation markers prevent LLM confusion about instruction vs data.
   * The schema reference guides the LLM to the insurance-specific schema structure
   * which includes policy_start_date, policy_end_date, policy_number, and
   * service_termination in addition to base fields.
   */
  const user = `Extract structured insurance invoice data per the rules. Return a single JSON object that matches the schema.

--- OCR START ---
${markdown}
--- OCR END ---`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
}
