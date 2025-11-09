/**
 * @fileoverview General/Vendor Invoice Extraction Prompt Templates
 *
 * This module provides prompt templates for extracting structured data from general
 * vendor invoices in the CIRA Invoice Processing System. General invoices represent
 * standard commercial invoices for goods or services without specialized fields like
 * policy dates, service periods, or tax assessments.
 *
 * Field Coverage (17 base fields):
 * - Date fields: invoice_date, invoice_due_date
 * - Identifier fields: invoice_number, account_number
 * - Entity fields: vendor_name, community_name
 * - Payment fields: payment_remittance_entity, payment_remittance_entity_care_of, payment_remittance_address
 * - Financial fields: total_amount_due, invoice_current_due_amount, invoice_past_due_amount, invoice_late_fee_amount, credit_amount
 * - Metadata fields: reasoning, valid_input, invoice_type
 *
 * Key Features:
 * - Focused extraction rules for base vendor invoice fields only
 * - No type-specific field rules (policy, service, tax fields excluded)
 * - Comprehensive identifier disambiguation (invoice# vs account# vs reference#)
 * - Payment remittance address formatting and multi-line handling
 * - Document validation to reject non-invoice documents
 * - Optimized token usage by excluding irrelevant field rules
 *
 * Prompt Design:
 * - Composes shared rules from invoice-rules.ts for consistency
 * - Adds general-specific rules for identifiers and payment remittance
 * - Emphasizes factual extraction without hallucination
 * - Clear output structure requirements for ReasonedField format
 *
 * Usage:
 * ```typescript
 * const messages = buildGeneralInvoicePrompt(ocrMarkdown);
 * const schema = buildInvoiceSchemaForType('general');
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
 * Builds optimized chat messages for general vendor invoice data extraction.
 *
 * This function creates a focused conversation that guides the LLM to extract
 * only the base vendor invoice fields (17 fields) without attempting to extract
 * type-specific fields like policy dates, service periods, or tax assessments.
 *
 * The prompt composition strategy:
 * 1. Start with core disambiguation rules (dates, label proximity, confidence)
 * 2. Add output structure requirements (JSON format, ReasonedField structure)
 * 3. Add entity rules (community name, vendor vs remittance)
 * 4. Add financial extraction rules (amounts, credits, late fees)
 * 5. Add identifier rules (invoice#, account# disambiguation)
 * 6. Add payment remittance rules (address formatting, care-of lines)
 * 7. Add validation rules (document validity, OCR quality)
 * 8. Add metadata policies (emission, confidence, reason codes)
 *
 * Why general-specific prompts matter:
 * - Reduces prompt tokens by ~30% compared to unified prompt
 * - Eliminates confusion from policy/service/tax field rules
 * - Improves extraction focus and reduces hallucination risk
 * - Enables optimization for standard vendor invoice patterns
 *
 * @param {string} markdown - OCR-extracted markdown text from invoice document
 * @returns {ChatMessage[]} Array of chat messages for LLM conversation
 *
 * @example
 * ```typescript
 * const messages = buildGeneralInvoicePrompt(ocrMarkdown);
 * // Use with general invoice schema (17 base fields only)
 * const schema = buildInvoiceSchemaForType('general');
 * const result = await callLlm({ messages, schema });
 * // Result contains only vendor fields, no policy/service/tax fields
 * ```
 */
export function buildGeneralInvoicePrompt(markdown: string): ChatMessage[] {
  /**
   * System message establishing extraction principles for general vendor invoices.
   *
   * The system message is composed from shared rule modules to ensure consistency
   * with other invoice types while focusing on general invoice field extraction.
   *
   * Rule ordering rationale:
   * 1. Core rules first (disambiguation, output format) - establishes foundation
   * 2. Entity rules (community, vendor) - critical for correct recipient/issuer identification
   * 3. Financial rules - most important fields for payment processing
   * 4. Identifier rules - important for tracking and reference
   * 5. Payment rules - necessary for remittance processing
   * 6. Validation rules - quality control and document filtering
   * 7. Metadata policies - guidance on optional fields and confidence scoring
   */
  const system = `You are a precise general invoice extraction assistant.

${CORE_DISAMBIGUATION_RULES}

${OUTPUT_STRUCTURE}

${COMMUNITY_NAME_RULES}

${COMMUNITY_BILL_TO_RULES}

${VENDOR_REMITTANCE_RULES}

${FINANCIAL_RULES}

${DATE_SANITY_RULES}

${IDENTIFIER_RULES}

${PAYMENT_REMITTANCE_RULES}

${DOCUMENT_VALIDATION_RULES}

${GENERAL_REASONING_GUIDANCE}

${CONFIDENCE_GUIDANCE}

${EMISSION_POLICY}

${REASON_CODE_GUIDANCE}
`;

  /**
   * User message providing the specific extraction task and OCR input content.
   *
   * The clear delineation with "--- OCR START/END ---" markers prevents the LLM
   * from treating OCR content as instructions or becoming confused about where
   * the actual invoice data begins.
   *
   * The instruction to "match the schema" refers to the Zod schema passed separately
   * to the AI SDK's generateObject function, which constrains the output structure.
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
