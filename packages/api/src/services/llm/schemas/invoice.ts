import { z } from 'zod';

// Schema is evolvable; add new optional/nullable fields to avoid breaking changes.

// Generic reasoning wrapper for structured field extraction
const ReasonedField = <T>(valueSchema: z.ZodType<T>) => z.object({
  value: valueSchema,
  reasoning: z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
  assumptions: z.array(z.string()).optional()
}).optional();

export const InvoiceSchema = z.object({
  // String fields with reasoning wrapper
  invoice_date: ReasonedField(z.string().nullable()).describe('Invoice date in various formats (MM/DD/YYYY, DD/MM/YYYY, Month DD, YYYY, etc.). Extract date when invoice was issued.'),
  invoice_number: ReasonedField(z.string().nullable()).describe('Invoice number, reference number, or invoice ID. May include prefixes like INV-, #, etc.'),
  invoice_due_date: ReasonedField(z.string().nullable()).describe('Payment due date. May be labeled as "Due Date", "Payment Due", "Net", etc.'),
  policy_number: ReasonedField(z.string().nullable()).describe('Policy number, policy ID, or account policy reference. Common in insurance invoices.'),
  account_number: ReasonedField(z.string().nullable()).describe('Account number, customer number, or client ID associated with the invoice.'),
  policy_start_date: ReasonedField(z.string().nullable()).describe('Policy effective start date or coverage begin date. Extract actual coverage start date.'),
  policy_end_date: ReasonedField(z.string().nullable()).describe('Policy expiration date or coverage end date. Extract actual coverage end date.'),
  service_start_date: ReasonedField(z.string().nullable()).describe('Service period start date. For services billed within a specific date range, extract the beginning of service period.'),
  service_end_date: ReasonedField(z.string().nullable()).describe('Service period end date. For services billed within a specific date range, extract the end of service period.'),
  payment_remittance_address: ReasonedField(z.string().nullable()).describe('Payment address, remit to address, or mailing address for payments. Full address including street, city, state, zip.'),
  payment_remittance_entity: ReasonedField(z.string().nullable()).describe('Company name or entity to remit payment to. May be different from invoice issuer.'),
  payment_remittance_entity_care_of: ReasonedField(z.string().nullable()).describe('Care of (c/o) or attention line for payment remittance entity.'),
  reasoning: ReasonedField(z.string().nullable()).describe('General reasoning or notes about the invoice extraction process or overall document quality.'),
  community_name: ReasonedField(z.string().nullable()).describe('Community name, subdivision, or property management community associated with the invoice.'),
  vendor_name: ReasonedField(z.string().nullable()).describe('Vendor name, supplier name, or service provider issuing the invoice.'),

  // Number fields with reasoning wrapper
  invoice_past_due_amount: ReasonedField(z.number().nullable()).describe('Past due amount, overdue balance, or previous unpaid amounts carried forward.'),
  invoice_current_due_amount: ReasonedField(z.number().nullable()).describe('Current amount due, total due, or balance due for this billing period.'),
  invoice_late_fee_amount: ReasonedField(z.number().nullable()).describe('Late fee, penalty amount, or additional charges for overdue payments.'),
  credit_amount: ReasonedField(z.number().nullable()).describe('Credit amount, credit balance, or refund amount applied to the account.'),

  // Boolean field with reasoning wrapper
  valid_input: ReasonedField(z.boolean()).describe('Whether the input document appears to be a valid invoice that can be processed.')
});

export type Invoice = z.infer<typeof InvoiceSchema>;