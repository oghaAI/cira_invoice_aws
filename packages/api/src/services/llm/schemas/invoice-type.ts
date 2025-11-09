/**
 * @fileoverview Invoice Type Classification Schema
 *
 * This module defines the Zod schema for invoice type classification in the
 * CIRA Invoice Processing System. The schema is used in the first stage of
 * two-stage LLM extraction to determine the invoice type before extracting
 * type-specific fields.
 *
 * Invoice Types:
 * - general: Standard vendor invoices without specialized fields
 * - insurance: Insurance policy invoices with policy dates and numbers
 * - utility: Utility service invoices with service period dates
 * - tax: Tax invoices with tax year and property identifiers
 *
 * Key Features:
 * - Simple classification schema for efficient LLM processing
 * - Type-safe TypeScript definitions
 * - Clear enum values for consistent categorization
 * - Supports downstream type-specific field extraction
 *
 * @version 1.0.0
 * @author CIRA Development Team
 * @since 2025-10-01
 */

import { z } from 'zod';

/**
 * Schema for invoice type classification.
 *
 * This schema is used in the first stage of two-stage LLM extraction to
 * determine the type of invoice being processed. The classification result
 * determines which fields should be extracted in the second stage.
 *
 * Classification Categories:
 * - general: Standard vendor invoices (default fallback)
 * - insurance: Insurance policy invoices requiring policy dates and numbers
 * - utility: Utility service invoices requiring service period dates
 * - tax: Tax invoices requiring tax year and property identifiers
 *
 * @example
 * ```typescript
 * const result = await callLlm({
 *   messages: buildInvoiceTypeClassificationPrompt(ocrText),
 *   schema: InvoiceTypeSchema
 * });
 * const invoiceType = result.data.invoice_type; // "general" | "insurance" | "utility" | "tax"
 * ```
 */
export const InvoiceTypeSchema = z.object({
  /**
   * The classified invoice type.
   *
   * Values:
   * - general: Standard vendor invoice (default)
   * - insurance: Insurance policy invoice
   * - utility: Utility service invoice
   * - tax: Tax invoice
   */
  invoice_type: z.enum(['general', 'insurance', 'utility', 'tax']).describe(
    'The type of invoice: general (standard vendor), insurance (policy-based), utility (service-based), or tax (property tax)'
  )
});

/**
 * TypeScript type inferred from InvoiceTypeSchema.
 *
 * @example
 * ```typescript
 * const classification: InvoiceType = {
 *   invoice_type: 'insurance'
 * };
 * ```
 */
export type InvoiceType = z.infer<typeof InvoiceTypeSchema>;
