/**
 * @fileoverview Tax Invoice Extraction Prompt Templates
 *
 * This module provides prompt templates for extracting structured data from property
 * tax invoices in the CIRA Invoice Processing System. Tax invoices include specialized
 * fields for tax years and property identifiers that are not present in general vendor
 * invoices.
 *
 * Field Coverage (19 fields = 17 base + 2 tax-specific):
 * - Base fields: All general invoice fields (dates, identifiers, financials, entities)
 * - Tax-specific fields:
 *   - tax_year: The tax year this assessment/bill applies to
 *   - property_id: Property/parcel identifier (parcel number, property ID)
 *
 * Key Features:
 * - Focused extraction rules for property tax invoices
 * - Tax year identification and validation
 * - Property/parcel number extraction
 * - Assessment terminology handling
 * - Government agency identification
 * - Tax district and levy extraction support
 *
 * Common Tax Invoice Patterns:
 * - Tax year: "Tax Year 2025", "2025 Property Tax", "Assessment Year 2025"
 * - Parcel ID: "Parcel Number: 12-345-678", "Parcel ID", "Property ID", "Assessment #"
 * - Vendor: County Assessor, Tax Collector, County Treasury, Municipal Tax Office
 * - Amounts: "Total Tax", "Total Due", "Annual Tax", "Assessment Amount"
 * - Multiple tax components: County Tax, Municipal Tax, School District Tax
 *
 * Tax Invoice Types Covered:
 * - Property tax bills (annual, semi-annual, quarterly)
 * - Real estate tax assessments
 * - County/municipal tax invoices
 * - School district tax bills
 * - Special assessment district levies
 *
 * Prompt Design:
 * - Extends general invoice rules with tax-specific field extraction
 * - Adds tax year vs invoice year disambiguation
 * - Includes property identifier extraction and validation
 * - Handles government entity terminology
 * - Maintains consistency with shared rules from invoice-rules.ts
 *
 * Usage:
 * ```typescript
 * const messages = buildTaxInvoicePrompt(ocrMarkdown);
 * const schema = buildInvoiceSchemaForType('tax');
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
 * Tax-specific field extraction rules.
 *
 * These rules address the unique challenges of tax invoice extraction:
 *
 * 1. Tax Year Identification:
 *    - Tax year is the assessment year, not the invoice year
 *    - May be labeled "Tax Year", "Assessment Year", embedded in title
 *    - Example: "2025 Property Tax Bill" → tax_year = "2025"
 *    - Can differ from invoice_date year (2025 tax bill issued in 2024)
 *    - Usually a 4-digit year format (YYYY)
 *
 * 2. Tax Year vs Invoice Year Disambiguation:
 *    - Invoice date: When the tax bill was issued/mailed
 *    - Tax year: Which year's taxes are being assessed
 *    - Example: Invoice dated 12/15/2024 for "Tax Year 2025"
 *    - The tax_year field should contain "2025", not "2024"
 *
 * 3. Property Identifier Extraction:
 *    - Critical for matching tax bills to specific properties
 *    - Many label variations: "Parcel Number", "Parcel ID", "Property ID",
 *      "Assessment Number", "Tax ID", "APN" (Assessor's Parcel Number)
 *    - Often formatted with dashes or spaces: "12-345-678" or "12 345 678"
 *    - Must be distinguished from account_number (billing account vs property identifier)
 *
 * 4. Property ID vs Account Number:
 *    - property_id: Physical property identifier (parcel, lot, assessment number)
 *    - account_number: Billing/taxpayer account number
 *    - Both may appear on same invoice with different values
 *    - Property ID is tied to the land/building; account is tied to the taxpayer
 *    - Prefer "Parcel" labels for property_id, "Account" labels for account_number
 *
 * 5. Government Entity Identification:
 *    - vendor_name should be the government agency issuing the tax
 *    - Common: "County Assessor", "Tax Collector", "County Treasury",
 *      "Municipal Tax Office", "[County Name] Tax Collector"
 *    - May appear as "[County/City Name] Office of the Tax Collector"
 *
 * 6. Tax Component Handling:
 *    - Tax bills often split into components: County, Municipal, School, Special Districts
 *    - For total_amount_due, use the final total (sum of all components)
 *    - Individual components are not extracted (schema doesn't have fields for them)
 *    - Labels: "Total Tax", "Total Due", "Total Amount Due", "Annual Tax Amount"
 */
export const TAX_SPECIFIC_RULES = `- Tax-specific field extraction:
  - tax_year: Look for "Tax Year", "Assessment Year", year embedded in title like "2025 Property Tax" or "Property Tax 2025". Extract the 4-digit year (YYYY format). This is the year being assessed, NOT the invoice date year.
  - property_id: Look for "Parcel Number", "Parcel ID", "Property ID", "Assessment Number", "Tax ID", "APN", "Assessor's Parcel Number". This identifies the physical property, NOT the billing account. May contain dashes, spaces, or alphanumeric format.

- Tax year vs invoice year disambiguation:
  - tax_year is the assessment year - which year's taxes are being billed.
  - invoice_date year is when the bill was issued - may be different from tax year.
  - Example: Invoice dated "12/15/2024" for "Tax Year 2025" → tax_year = "2025", invoice_date = "12/15/2024".
  - Prefer explicit "Tax Year" or "Assessment Year" labels over inferring from invoice date.
  - If tax year appears in document title ("2025 Property Tax Bill"), extract "2025" with high confidence.

- Property ID vs account number disambiguation:
  - property_id: Physical property identifier (parcel, lot, assessment #). Tied to the land/building.
  - account_number: Billing/taxpayer account number. Tied to the taxpayer/owner.
  - Both may appear on same invoice with different values.
  - Prefer labels containing "Parcel" for property_id.
  - Prefer labels containing "Account" for account_number.
  - If only one identifier exists, determine from label whether it's property or account based.

- Government entity identification:
  - vendor_name should be the government agency issuing the tax bill.
  - Common patterns: "County Assessor", "Tax Collector", "County Treasury", "[County Name] Tax Collector", "Office of the Tax Collector".
  - May include county/city name: "Cook County Tax Collector", "City of Springfield Tax Office".
  - Exclude payment processor names (lockboxes, banks) - those belong in payment_remittance_entity.

- Tax amount extraction:
  - Tax bills often show multiple components: County Tax, City Tax, School Tax, Special Districts.
  - For total_amount_due, extract the final total amount (sum of all tax components).
  - Look for "Total Tax", "Total Due", "Total Amount Due", "Annual Tax Amount", "Total Property Tax".
  - If only individual components exist without a total, sum them if clearly labeled, otherwise set total_amount_due to null.
  - Installment amounts: If bill shows installment options (e.g., "1st Half", "2nd Half"), extract the full annual total for total_amount_due, not individual installments.`;

/**
 * Builds optimized chat messages for tax invoice data extraction.
 *
 * This function creates a focused conversation that guides the LLM to extract
 * both base vendor invoice fields AND tax-specific fields (tax year, property ID).
 *
 * The prompt composition strategy:
 * 1. Start with core disambiguation and output structure (foundation)
 * 2. Add entity and financial rules (common to all invoices)
 * 3. Add identifier and payment rules (common to all invoices)
 * 4. Add TAX-SPECIFIC RULES (tax year, property ID, government entities)
 * 5. Add validation and metadata policies (quality control)
 *
 * Why tax-specific prompts matter:
 * - Tax year must be distinguished from invoice year (common confusion point)
 * - Property ID must be distinguished from account number (both often present)
 * - Government entity terminology differs from commercial vendors
 * - Tax component aggregation requires specific guidance
 * - Installment vs total amount disambiguation is critical
 *
 * Token efficiency:
 * - Only includes tax-specific rules (not insurance or utility rules)
 * - Reduces prompt size by ~25% compared to unified prompt with all types
 * - Improves LLM focus by eliminating irrelevant field guidance
 *
 * @param {string} markdown - OCR-extracted markdown text from tax invoice
 * @returns {ChatMessage[]} Array of chat messages for LLM conversation
 *
 * @example
 * ```typescript
 * const messages = buildTaxInvoicePrompt(ocrMarkdown);
 * // Use with tax invoice schema (17 base + 2 tax fields)
 * const schema = buildInvoiceSchemaForType('tax');
 * const result = await callLlm({ messages, schema });
 * // Result contains base fields + tax_year, property_id
 * ```
 */
export function buildTaxInvoicePrompt(markdown: string): ChatMessage[] {
  /**
   * System message establishing extraction principles for tax invoices.
   *
   * Rule ordering rationale:
   * 1. Core rules (disambiguation, output) - foundation for all extraction
   * 2. Entity rules (community, vendor) - identify taxpayer and tax authority
   * 3. Financial rules - tax amounts, installments, totals
   * 4. Date rules - invoice dates, due dates, tax year distinction
   * 5. Identifier rules - account numbers, invoice numbers
   * 6. Payment rules - remittance processing (often different from tax authority)
   * 7. TAX-SPECIFIC - tax year, property ID, government entities (key differentiator)
   * 8. Validation & metadata - quality control and confidence scoring
   *
   * The tax-specific rules are placed after general identifier rules so the LLM
   * first understands the general pattern (invoice# vs account#) before learning
   * the tax-specific pattern (property_id as distinct from both).
   */
  const system = `You are a precise tax invoice extraction assistant.

${CORE_DISAMBIGUATION_RULES}

${OUTPUT_STRUCTURE}

${COMMUNITY_NAME_RULES}

${COMMUNITY_BILL_TO_RULES}

${VENDOR_REMITTANCE_RULES}

${FINANCIAL_RULES}

${DATE_SANITY_RULES}

${IDENTIFIER_RULES}

${PAYMENT_REMITTANCE_RULES}

${TAX_SPECIFIC_RULES}

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
   * The schema reference guides the LLM to the tax-specific schema structure
   * which includes tax_year and property_id in addition to base fields.
   */
  const user = `Extract structured tax invoice data per the rules. Return a single JSON object that matches the schema.

--- OCR START ---
${markdown}
--- OCR END ---`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
}
