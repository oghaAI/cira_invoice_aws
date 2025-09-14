import { describe, it, expect } from 'vitest';
import { InvoiceSchema, Invoice } from './invoice.js';

describe('InvoiceSchema', () => {
  it('should accept empty object (all fields optional)', () => {
    const result = InvoiceSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept valid structured field with all properties', () => {
    const validInvoice = {
      invoice_date: {
        value: '2024-01-15',
        reasoning: 'Found in header section',
        confidence: 'high' as const,
        assumptions: ['Date format is MM/DD/YYYY']
      },
      invoice_number: {
        value: 'INV-2024-001',
        reasoning: 'Located in top right corner',
        confidence: 'high' as const
      }
    };

    const result = InvoiceSchema.safeParse(validInvoice);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.invoice_date?.value).toBe('2024-01-15');
      expect(result.data.invoice_date?.confidence).toBe('high');
      expect(result.data.invoice_number?.value).toBe('INV-2024-001');
    }
  });

  it('should accept null values in structured fields', () => {
    const invoiceWithNulls = {
      invoice_date: {
        value: null,
        reasoning: 'Date not present in document',
        confidence: 'low' as const
      },
      invoice_current_due_amount: {
        value: 150.75,
        reasoning: 'Found in amount due section',
        confidence: 'medium' as const
      }
    };

    const result = InvoiceSchema.safeParse(invoiceWithNulls);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.invoice_date?.value).toBe(null);
      expect(result.data.invoice_current_due_amount?.value).toBe(150.75);
    }
  });

  it('should reject invalid confidence values', () => {
    const invalidInvoice = {
      invoice_date: {
        value: '2024-01-15',
        reasoning: 'Found in header',
        confidence: 'invalid' as any
      }
    };

    const result = InvoiceSchema.safeParse(invalidInvoice);
    expect(result.success).toBe(false);
  });

  it('should accept boolean fields with reasoning', () => {
    const invoiceWithBoolean = {
      valid_input: {
        value: true,
        reasoning: 'Document appears to be a valid invoice with all required fields',
        confidence: 'high' as const
      }
    };

    const result = InvoiceSchema.safeParse(invoiceWithBoolean);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid_input?.value).toBe(true);
    }
  });

  it('should ignore unknown keys', () => {
    const invoiceWithUnknown = {
      invoice_date: {
        value: '2024-01-15',
        reasoning: 'Found in header',
        confidence: 'high' as const
      },
      unknown_field: 'should be ignored'
    };

    const result = InvoiceSchema.safeParse(invoiceWithUnknown);
    expect(result.success).toBe(true);
    if (result.success) {
      expect('unknown_field' in result.data).toBe(false);
    }
  });

  it('should type correctly with Invoice type', () => {
    const invoice: Invoice = {
      invoice_date: {
        value: '2024-01-15',
        reasoning: 'Header section',
        confidence: 'high'
      }
    };

    expect(invoice.invoice_date?.value).toBe('2024-01-15');
  });
});