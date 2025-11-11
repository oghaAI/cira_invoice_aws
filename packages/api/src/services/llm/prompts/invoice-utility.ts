/**
 * @fileoverview Utility Invoice Extraction Prompt Templates
 *
 * This module provides prompt templates for extracting structured data from utility
 * service invoices in the CIRA Invoice Processing System. Utility invoices include
 * specialized fields for service periods, usage billing dates, and service termination
 * that are not present in general vendor invoices.
 *
 * Field Coverage (20 fields = 17 base + 3 utility-specific):
 * - Base fields: All general invoice fields (dates, identifiers, financials, entities)
 * - Utility-specific fields:
 *   - service_start_date: Service/billing period start date
 *   - service_end_date: Service/billing period end date
 *   - service_termination: Whether service is being disconnected/terminated
 *
 * Key Features:
 * - Focused extraction rules for utility service invoices
 * - Service period vs invoice date disambiguation
 * - Billing period extraction and validation
 * - Disconnection/termination detection patterns
 * - Usage period identification
 * - Meter reading date handling
 *
 * Common Utility Invoice Patterns:
 * - Service periods: "Service Period: MM/DD/YYYY - MM/DD/YYYY"
 * - Billing periods: "Billing Period From MM/DD/YYYY To MM/DD/YYYY"
 * - Usage periods: "Usage Period: MM/DD - MM/DD"
 * - Termination: "Final Bill", "Service Disconnection", "Account Closed"
 * - Meter readings often have dates that differ from billing period
 *
 * Utility Types Covered:
 * - Electric utilities (kWh usage)
 * - Gas utilities (Therms, CCF usage)
 * - Water utilities (Gallons, CCF usage)
 * - Sewer utilities
 * - Waste management utilities
 *
 * Prompt Design:
 * - Extends general invoice rules with utility-specific field extraction
 * - Adds service period vs billing date disambiguation
 * - Includes termination/disconnection pattern detection
 * - Handles usage-based billing terminology
 * - Maintains consistency with shared rules from invoice-rules.ts
 *
 * Usage:
 * ```typescript
 * const messages = buildUtilityInvoicePrompt(ocrMarkdown);
 * const schema = buildInvoiceSchemaForType('utility');
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
 * Utility-specific field extraction rules.
 *
 * These rules address the unique challenges of utility invoice extraction:
 *
 * 1. Service Period Disambiguation:
 *    - Service period defines when utilities were consumed (usage period)
 *    - Billing period may be the same as service period or slightly different
 *    - Invoice date is when the bill was generated (after service period ends)
 *    - Due date is when payment is required (after invoice date)
 *    - Meter reading dates may fall within or at the boundaries of service period
 *
 * 2. Service Period Extraction:
 *    - Often presented as a range: "Service Period: 01/01/2025 - 01/31/2025"
 *    - May be labeled "Billing Period", "Usage Period", "Period of Service"
 *    - Split format common: "Period From: 01/01/25 To: 01/31/25"
 *    - End date is typically the day before invoice date (bill generated after period ends)
 *
 * 3. Service Termination Detection:
 *    - Indicates account closure or service disconnection
 *    - Critical for final bill processing (no future bills expected)
 *    - Common patterns: "Final Bill", "Service Disconnection", "Account Closed"
 *    - May appear as "Service Terminated" or "Disconnect Notice"
 *
 * 4. Meter Reading Date Handling:
 *    - Meter readings have dates (when meter was read)
 *    - These are NOT the service period dates
 *    - Previous meter reading date ≈ service_start_date
 *    - Current meter reading date ≈ service_end_date
 *    - But prefer explicit "Service Period" labels over inferred meter dates
 *
 * 5. Usage-Based Billing Terminology:
 *    - Amounts may be split: "Supply Charges", "Delivery Charges", "Usage Charges"
 *    - Total may be labeled "Total Current Charges" or "Amount Due This Period"
 *    - Previous balance often carried forward on utility bills
 */
export const UTILITY_SPECIFIC_RULES = `- Utility-specific field extraction:
  - service_start_date: Look for "Service Period Start", "Service Period From", "Billing Period From", "Usage Period Start", "Period Beginning". This is when utility consumption began for this billing cycle, NOT the invoice date.
  - service_end_date: Look for "Service Period End", "Service Period To", "Billing Period To", "Usage Period End", "Period Ending". This is when utility consumption ended for this billing cycle.
  - service_termination: Set to true if document indicates service disconnection or account closure. Look for "Service terminating", "Service Disconnection", "Disconnect Notice". Set to false if no termination indicators present. Set to null if unclear.

- Service period disambiguation:
  - Service period (service_start_date, service_end_date) defines when utilities were consumed - the usage/billing period.
  - Invoice date (invoice_date) is when the bill was generated - typically shortly after service period ends.
  - Due date (invoice_due_date) is when payment must be received.
  - All three are different dates with different meanings - do not confuse them.
  - If a date range appears near "Service Period", "Billing Period", or "Usage Period", extract start → service_start_date, end → service_end_date.
  - Validate: service_end_date should be after service_start_date. If not, set both to null with evidence_snippet.
  - Typical pattern: service_end_date is 1-3 days before invoice_date (bill generated after period closes).

- Meter reading dates vs service period:
  - Meter reading dates indicate when the meter was physically read.
  - "Previous Reading Date" is close to service_start_date but may not be exact.
  - "Current Reading Date" is close to service_end_date but may not be exact.
  - Prefer explicit "Service Period" or "Billing Period" labels over inferred meter reading dates.
  - If only meter reading dates exist, use them as service period dates with medium confidence and note assumption.

- Usage-based billing:
  - Utility bills often split charges: "Supply", "Delivery", "Usage", "Generation", "Distribution".
  - For invoice_current_due_amount, look for "Total Current Charges", "Current Period Charges", "This Period Amount".
  - Previous balance (invoice_past_due_amount) is commonly carried forward on utility bills.
  - Total amount due includes current charges + previous balance - payments/credits.`;

/**
 * Builds optimized chat messages for utility invoice data extraction.
 *
 * This function creates a focused conversation that guides the LLM to extract
 * both base vendor invoice fields AND utility-specific fields (service dates,
 * service termination).
 *
 * The prompt composition strategy:
 * 1. Start with core disambiguation and output structure (foundation)
 * 2. Add entity and financial rules (common to all invoices)
 * 3. Add identifier and payment rules (common to all invoices)
 * 4. Add UTILITY-SPECIFIC RULES (service period, termination, usage billing)
 * 5. Add validation and metadata policies (quality control)
 *
 * Why utility-specific prompts matter:
 * - Service period extraction requires specific label mapping and disambiguation
 * - Meter reading dates must be distinguished from service period dates
 * - Termination detection affects downstream workflows (final bill processing)
 * - Usage-based billing terminology differs from standard vendor invoices
 * - Service periods are monthly/bimonthly cycles requiring careful date extraction
 *
 * Token efficiency:
 * - Only includes utility-specific rules (not insurance or tax rules)
 * - Reduces prompt size by ~25% compared to unified prompt with all types
 * - Improves LLM focus by eliminating irrelevant field guidance
 *
 * @param {string} markdown - OCR-extracted markdown text from utility invoice
 * @returns {ChatMessage[]} Array of chat messages for LLM conversation
 *
 * @example
 * ```typescript
 * const messages = buildUtilityInvoicePrompt(ocrMarkdown);
 * // Use with utility invoice schema (17 base + 3 utility fields)
 * const schema = buildInvoiceSchemaForType('utility');
 * const result = await callLlm({ messages, schema });
 * // Result contains base fields + service_start_date, service_end_date,
 * // service_termination
 * ```
 */
export function buildUtilityInvoicePrompt(markdown: string): ChatMessage[] {
  /**
   * System message establishing extraction principles for utility invoices.
   *
   * Rule ordering rationale:
   * 1. Core rules (disambiguation, output) - foundation for all extraction
   * 2. Entity rules (community, vendor) - identify service address and provider
   * 3. Financial rules - current charges, previous balance, total due
   * 4. Date rules - critical for utility due to service period vs billing dates
   * 5. Identifier rules - account, invoice, meter number disambiguation
   * 6. Payment rules - remittance processing
   * 7. UTILITY-SPECIFIC - service period, termination detection (key differentiator)
   * 8. Validation & metadata - quality control and confidence scoring
   *
   * The utility-specific rules are placed after date rules so the LLM first
   * understands general date disambiguation before learning the utility-specific
   * pattern (service period as distinct from invoice/due dates).
   */
  const system = `You are a precise utility invoice extraction assistant.

${CORE_DISAMBIGUATION_RULES}

${OUTPUT_STRUCTURE}

${COMMUNITY_NAME_RULES}

${COMMUNITY_BILL_TO_RULES}

${VENDOR_REMITTANCE_RULES}

${FINANCIAL_RULES}

${DATE_SANITY_RULES}

${IDENTIFIER_RULES}

${PAYMENT_REMITTANCE_RULES}

${UTILITY_SPECIFIC_RULES}

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
   * The schema reference guides the LLM to the utility-specific schema structure
   * which includes service_start_date, service_end_date, and service_termination
   * in addition to base fields.
   */
  const user = `Extract structured utility invoice data per the rules. Return a single JSON object that matches the schema.

--- OCR START ---
${markdown}
--- OCR END ---`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
}
