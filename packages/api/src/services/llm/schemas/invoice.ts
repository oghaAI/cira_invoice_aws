/**
 * @fileoverview Invoice Data Extraction Schema
 *
 * This module defines the comprehensive Zod schema for structured invoice data extraction
 * in the CIRA Invoice Processing System. The schema supports reasoned field extraction
 * with confidence scoring for each field, enabling quality assessment and validation.
 *
 * Key Features:
 * - Reasoned field extraction with explanations for each value
 * - Confidence scoring (low/medium/high) for quality assessment
 * - Comprehensive invoice field coverage including financial and metadata fields
 * - Evolvable schema design with optional/nullable fields for backward compatibility
 * - Type-safe definitions with full TypeScript integration
 * - Support for complex field types (strings, numbers, booleans) with reasoning
 *
 * Schema Design Principles:
 * - All fields are optional to handle varying invoice formats
 * - Each field includes reasoning and confidence for transparency
 * - Nullable values allow explicit representation of missing data
 * - Consistent naming conventions for field identification
 * - Extensible structure for future field additions
 *
 * Field Categories:
 * - Date fields: invoice_date, due_date, policy dates, service dates
 * - Identifier fields: invoice_number, policy_number, account_number
 * - Financial fields: current_due, past_due, late_fees, credits
 * - Contact fields: payment remittance information, vendor details
 * - Validation fields: document validity assessment
 *
 * @version 1.0.0
 * @author CIRA Development Team
 * @since 2025-09-15
 */

import { z } from 'zod';

// Schema is evolvable; add new optional/nullable fields to avoid breaking changes.

/**
 * Generic reasoning wrapper for structured field extraction.
 *
 * This higher-order function creates a Zod schema that wraps any value type
 * with reasoning, confidence, and optional assumptions. This pattern enables
 * transparent AI decision-making by requiring explanations for every extracted value.
 *
 * @param {z.ZodType<T>} valueSchema - The Zod schema for the actual field value
 * @returns {z.ZodOptional} Optional schema with reasoning wrapper
 *
 * @example
 * ```typescript
 * const AmountField = ReasonedField(z.number().nullable());
 * // Results in: { value: number | null, reasoning: string, confidence: 'low' | 'medium' | 'high', assumptions?: string[] }
 * ```
 */
const ReasonedField = <T>(valueSchema: z.ZodType<T>) =>
  z
    .object({
      /** The extracted value of the specified type */
      value: valueSchema,
      /** Explanation (optional). Keep concise; do not include chain-of-thought. */
      reasoning: z.string().max(120).optional(),
      /** Categorical reason for selection (optional) */
      reason_code: z.enum(['explicit_label', 'nearby_header', 'inferred_layout', 'conflict', 'missing']).optional(),
      /** Short evidence excerpt from source text (optional) */
      evidence_snippet: z.string().max(80).optional(),
      /** Confidence level for this extraction */
      confidence: z.enum(['low', 'medium', 'high']),
      /** Optional assumptions made during extraction */
      assumptions: z.array(z.string()).optional()
    })
    .optional();

/**
 * Comprehensive invoice data extraction schema with reasoned field extraction.
 *
 * This schema defines the complete structure for extracting structured data from invoice documents.
 * Each field is wrapped with reasoning and confidence to provide transparency in the extraction process.
 * The schema is designed to handle various invoice formats while maintaining consistency in output structure.
 *
 * Design Features:
 * - All fields are optional to accommodate varying invoice formats
 * - Nullable values explicitly represent missing or unavailable data
 * - Reasoned extraction provides explanation for every field decision
 * - Confidence scoring enables quality assessment and filtering
 * - Comprehensive field coverage for common invoice elements
 * - Evolvable design allows adding fields without breaking changes
 *
 * Usage:
 * - Used with Azure OpenAI for structured data extraction
 * - Validated through Zod for type safety and runtime checking
 * - Processed for confidence calculation and quality scoring
 * - Stored in database as JSONB for flexible querying
 *
 * @example
 * ```typescript
 * const result = await extractStructured(InvoiceSchema, { markdown: ocrText });
 * const invoice = result.data; // Fully typed Invoice object
 * ```
 */
export const InvoiceSchema = z.object({
  // === DATE FIELDS ===
  // Critical for payment processing and record keeping

  /** Invoice issue date - primary date for chronological sorting and aging analysis */
  invoice_date: ReasonedField(z.string().nullable()).describe(
    'Invoice date in various formats (MM/DD/YYYY, DD/MM/YYYY, Month DD, YYYY, etc.). Extract date when invoice was issued.'
  ),

  /** Payment due date - essential for payment scheduling and late fee calculations */
  invoice_due_date: ReasonedField(z.string().nullable()).describe(
    'Payment due date. May be labeled as "Due Date", "Payment Due"'
  ),

  /** Policy coverage start date - important for insurance and subscription invoices */
  policy_start_date: ReasonedField(z.string().nullable()).describe(
    'Policy effective start date or coverage begin date. Extract actual coverage start date.'
  ),

  /** Policy coverage end date - defines coverage period and renewal dates */
  policy_end_date: ReasonedField(z.string().nullable()).describe(
    'Policy expiration date or coverage end date. Extract actual coverage end date.'
  ),

  /** Service period start - defines billing period for service-based invoices */
  service_start_date: ReasonedField(z.string().nullable()).describe(
    'Service period start date. For services billed within a specific date range, extract the beginning of service period.'
  ),

  /** Service period end - completes billing period definition */
  service_end_date: ReasonedField(z.string().nullable()).describe(
    'Service period end date. For services billed within a specific date range, extract the end of service period.'
  ),

  // === IDENTIFIER FIELDS ===
  // Critical for invoice tracking, reference, and account management

  /** Primary invoice identifier - essential for tracking and reference */
  invoice_number: ReasonedField(z.string().nullable()).describe(
    'Invoice number, reference number, or invoice ID. May include prefixes like INV-, #, etc.'
  ),

  /** Policy reference number - links invoice to insurance or service policy */
  policy_number: ReasonedField(z.string().nullable()).describe(
    'Policy number, policy ID, or account policy reference. Common in insurance invoices.'
  ),

  /** Customer account identifier - links invoice to customer account */
  account_number: ReasonedField(z.string().nullable()).describe(
    'Account number, customer number, or client ID associated with the invoice.'
  ),

  // === ENTITY AND CONTACT FIELDS ===
  // Important for vendor management and payment processing

  /** Primary vendor identification - who issued the invoice */
  vendor_name: ReasonedField(z.string().nullable()).describe(
    'Vendor name, supplier name, or service provider issuing the invoice.'
  ),

  /** Community or property identification - specific to property management invoices */
  community_name: ReasonedField(z.string().nullable()).describe(
    'Community name, subdivision, or property management community associated with the invoice.'
  ),

  /** Payment destination entity - who should receive payment */
  payment_remittance_entity: ReasonedField(z.string().nullable()).describe(
    'Company name or entity to remit payment to. May be different from invoice issuer.'
  ),

  /** Payment address care of line - additional routing for payments */
  payment_remittance_entity_care_of: ReasonedField(z.string().nullable()).describe(
    'Care of (c/o) or attention line for payment remittance entity.'
  ),

  /** Complete payment mailing address - where to send payments */
  payment_remittance_address: ReasonedField(z.string().nullable()).describe(
    'Payment address, remit to address, or mailing address for payments. Full address including street, city, state, zip.'
  ),

  // === METADATA AND REASONING FIELDS ===
  // Supporting information for quality assessment and debugging

  /** General extraction notes - overall assessment of document and extraction quality */
  reasoning: ReasonedField(z.string().nullable()).describe(
    'General reasoning or notes about the invoice extraction process or overall document quality.'
  ),

  // === FINANCIAL FIELDS ===
  // Critical for payment processing, accounting, and financial reconciliation

  /** Past due balance - amount overdue from previous billing periods */
  invoice_past_due_amount: ReasonedField(z.number().nullable()).describe(
    'Past due amount, overdue balance, or previous unpaid amounts carried forward.'
  ),

  /** Current amount due - primary payment amount for this invoice */
  invoice_current_due_amount: ReasonedField(z.number().nullable()).describe(
    'Current amount due, total due, or balance due for this billing period.'
  ),

  /** Late fee charges - penalties for overdue payments */
  invoice_late_fee_amount: ReasonedField(z.number().nullable()).describe(
    'Late fee, penalty amount, or additional charges for overdue payments.'
  ),

  /** Credit applied - refunds or credits reducing the amount due */
  credit_amount: ReasonedField(z.number().nullable()).describe(
    'Credit amount, credit balance, or refund amount applied to the account.'
  ),

  // === VALIDATION FIELDS ===
  // Quality control and document validation

  /** Document validity assessment - whether this is a processable invoice */
  valid_input: ReasonedField(z.boolean()).describe(
    'Whether the input document appears to be a valid invoice that can be processed.'
  )
});

/**
 * TypeScript type inferred from the InvoiceSchema.
 *
 * This type provides full type safety for invoice data throughout the application.
 * All fields are optional due to the schema design, and each field contains
 * value, reasoning, confidence, and optional assumptions.
 *
 * @example
 * ```typescript
 * const invoice: Invoice = {
 *   invoice_date: {
 *     value: "2025-01-15",
 *     reasoning: "Date found in top-right corner of document",
 *     confidence: "high"
 *   },
 *   invoice_current_due_amount: {
 *     value: 1250.00,
 *     reasoning: "Total amount clearly labeled as 'Amount Due'",
 *     confidence: "high"
 *   }
 * };
 * ```
 */
export type Invoice = z.infer<typeof InvoiceSchema>;
