import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { extractStructured, __setAiFns, __resetAiFns, ConfidenceWeights } from './client.js';
import { InvoiceSchema } from './schemas/invoice.js';

describe('extractStructured', () => {
  beforeEach(() => {
    // Mock environment variables
    vi.stubEnv('AZURE_OPENAI_ENDPOINT', 'https://test.openai.azure.com');
    vi.stubEnv('AZURE_OPENAI_API_KEY', 'test-key');
    vi.stubEnv('AZURE_OPENAI_DEPLOYMENT', 'test-deployment');

    // Mock AI SDK functions
    __setAiFns({
      generateObject: async ({ schema }) => ({
        object: {
          invoice_date: {
            value: '2024-01-15',
            reasoning: 'Found in header section',
            confidence: 'high'
          },
          invoice_current_due_amount: {
            value: 150.75,
            reasoning: 'Located in amount due section',
            confidence: 'medium'
          },
          vendor_name: {
            value: null,
            reasoning: 'Not present in document',
            confidence: 'low'
          }
        },
        usage: { totalTokens: 1500 }
      })
    });
  });

  afterEach(() => {
    __resetAiFns();
  });

  it('should extract structured data with default confidence weights', async () => {
    const result = await extractStructured(InvoiceSchema, {
      markdown: 'Mock invoice content'
    });

    expect(result.data).toBeDefined();
    expect(result.tokensUsed).toBe(1500);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.data.invoice_date?.value).toBe('2024-01-15');
    expect(result.data.invoice_current_due_amount?.value).toBe(150.75);
  });

  it('should calculate weighted confidence with custom weights', async () => {
    const customWeights: ConfidenceWeights = {
      amounts: 0.5,  // Higher weight for amounts
      dates: 0.3,
      names: 0.2
    };

    const result = await extractStructured(InvoiceSchema, {
      markdown: 'Mock invoice content'
    }, { confidenceWeights: customWeights });

    expect(result.confidence).toBeGreaterThan(0);

    // Should weight amounts higher due to custom weights
    // amounts (medium=0.6) * 0.5 + dates (high=0.9) * 0.3 + names (low=0.3) * 0.2
    // = 0.3 + 0.27 + 0.06 = 0.63 / 1.0 = 0.63
    expect(result.confidence).toBeCloseTo(0.63, 2);
  });

  it('should normalize string fields by trimming', async () => {
    __setAiFns({
      generateObject: async () => ({
        object: {
          invoice_number: {
            value: '  INV-2024-001  ',
            reasoning: 'Found with extra spaces',
            confidence: 'high'
          }
        },
        usage: { totalTokens: 800 }
      })
    });

    const result = await extractStructured(InvoiceSchema, {
      markdown: 'Mock invoice content'
    });

    expect(result.data.invoice_number?.value).toBe('INV-2024-001');
  });

  it('should convert numeric strings to numbers for amount fields', async () => {
    __setAiFns({
      generateObject: async () => ({
        object: {
          invoice_current_due_amount: {
            value: '250.50',
            reasoning: 'Found as string in document',
            confidence: 'medium'
          }
        },
        usage: { totalTokens: 900 }
      })
    });

    const result = await extractStructured(InvoiceSchema, {
      markdown: 'Mock invoice content'
    });

    expect(result.data.invoice_current_due_amount?.value).toBe(250.50);
    expect(typeof result.data.invoice_current_due_amount?.value).toBe('number');
  });

  it('should throw LlmError on AI SDK failure', async () => {
    __setAiFns({
      generateObject: async () => {
        throw new Error('API timeout');
      }
    });

    await expect(
      extractStructured(InvoiceSchema, { markdown: 'test' })
    ).rejects.toThrow();
  });
});