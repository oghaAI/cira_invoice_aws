import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handler } from './llm-extraction';
import { __setAiFns, __resetAiFns } from '../services/llm/client';

// Mock DatabaseClient
const mockGetJobResult = vi.fn();
const mockUpsertJobResult = vi.fn();
const mockEnd = vi.fn();

vi.mock('@cira/database', () => ({
  DatabaseClient: vi.fn().mockImplementation(() => ({
    getJobResult: mockGetJobResult,
    upsertJobResult: mockUpsertJobResult,
    end: mockEnd
  }))
}));

describe('llm-extraction handler', () => {
  beforeEach(() => {
    // Mock environment variables
    vi.stubEnv('AZURE_OPENAI_ENDPOINT', 'https://test.openai.azure.com');
    vi.stubEnv('AZURE_OPENAI_API_KEY', 'test-key');
    vi.stubEnv('AZURE_OPENAI_DEPLOYMENT', 'test-deployment');
    vi.stubEnv('DATABASE_PROXY_ENDPOINT', 'test-host');
    vi.stubEnv('DATABASE_NAME', 'test-db');

    // Reset mocks
    mockGetJobResult.mockReset();
    mockUpsertJobResult.mockReset();
    mockEnd.mockReset();

    // Mock AI SDK functions for successful extraction
    __setAiFns({
      generateObject: async () => ({
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
          },
          valid_input: {
            value: true,
            reasoning: 'Document appears to be a valid invoice',
            confidence: 'high'
          }
        },
        usage: { totalTokens: 1500 }
      })
    });

    // Mock successful database responses
    mockGetJobResult.mockResolvedValue({
      rawOcrText: 'Mock invoice content with amounts and dates'
    });
    mockUpsertJobResult.mockResolvedValue({});
  });

  afterEach(() => {
    __resetAiFns();
  });

  it('should successfully extract structured data and persist to database', async () => {
    const event = {
      jobId: 'test-job-123',
      ocr: {
        metadata: {
          pages: 2,
          durationMs: 5000
        }
      }
    };

    const result = await handler(event);

    expect(result.status).toBe('llm_completed');
    expect(result.jobId).toBe('test-job-123');
    expect(result.result.extractedData).toBeDefined();
    expect(result.result.tokensUsed).toBe(1500);

    // Verify database calls
    expect(mockGetJobResult).toHaveBeenCalledWith('test-job-123');
    expect(mockUpsertJobResult).toHaveBeenCalledWith({
      jobId: 'test-job-123',
      extractedData: expect.objectContaining({
        invoice_date: expect.objectContaining({
          value: '2024-01-15',
          confidence: 'high'
        }),
        invoice_current_due_amount: expect.objectContaining({
          value: 150.75,
          confidence: 'medium'
        })
      }),
      confidence: expect.any(Number), // extractStructured calculates confidence
      tokensUsed: 1500
    });
  });

  it('should throw error for missing jobId', async () => {
    const event = {
      ocr: { metadata: { pages: 1 } }
    };

    await expect(handler(event)).rejects.toThrow('LLM_EXTRACTION_ERROR: Missing jobId');
  });

  it('should throw error when OCR metadata missing', async () => {
    const event = {
      jobId: 'test-job-123'
    };

    await expect(handler(event)).rejects.toThrow('LLM_EXTRACTION_ERROR: OCR metadata missing');
  });

  it('should throw error when no OCR text available', async () => {
    mockGetJobResult.mockResolvedValue(null);

    const event = {
      jobId: 'test-job-123',
      ocr: { metadata: { pages: 1 } }
    };

    await expect(handler(event)).rejects.toThrow('LLM_EXTRACTION_ERROR: No OCR text available');
  });

  it('should throw error when OCR text is empty', async () => {
    mockGetJobResult.mockResolvedValue({ rawOcrText: null });

    const event = {
      jobId: 'test-job-123',
      ocr: { metadata: { pages: 1 } }
    };

    await expect(handler(event)).rejects.toThrow('LLM_EXTRACTION_ERROR: No OCR text available');
  });

  it('should handle field_reasoning and field_confidence correctly', async () => {
    const event = {
      jobId: 'test-job-123',
      ocr: { metadata: { pages: 1 } }
    };

    const result = await handler(event);

    expect(result.result.extractedData).toBeDefined();
    expect(result.result.extractedData.invoice_date?.reasoning).toBe('Found in header section');
    expect(result.result.extractedData.invoice_date?.confidence).toBe('high');
    expect(result.result.extractedData.vendor_name?.reasoning).toBe('Not present in document');
    expect(result.result.extractedData.vendor_name?.confidence).toBe('low');
  });

  it('should persist JSONB including field_reasoning and field_confidence', async () => {
    const event = {
      jobId: 'test-job-123',
      ocr: { metadata: { pages: 1 } }
    };

    await handler(event);

    const persistedData = mockUpsertJobResult.mock.calls[0][0].extractedData;
    expect(persistedData).toMatchObject({
      invoice_date: {
        value: '2024-01-15',
        reasoning: 'Found in header section',
        confidence: 'high'
      },
      vendor_name: {
        value: null,
        reasoning: 'Not present in document',
        confidence: 'low'
      }
    });
  });

  it('should handle missing optional fields by storing nulls', async () => {
    // Mock response with only some fields
    __setAiFns({
      generateObject: async () => ({
        object: {
          invoice_date: {
            value: '2024-01-15',
            reasoning: 'Found in header',
            confidence: 'high'
          }
          // Other fields are missing (optional)
        },
        usage: { totalTokens: 800 }
      })
    });

    const event = {
      jobId: 'test-job-123',
      ocr: { metadata: { pages: 1 } }
    };

    const result = await handler(event);

    expect(result.result.extractedData.invoice_date).toBeDefined();
    expect(result.result.extractedData.vendor_name).toBeUndefined(); // Missing optional fields
    expect(result.result.tokensUsed).toBe(800);
  });

  it('should handle database errors gracefully', async () => {
    mockGetJobResult.mockRejectedValue(new Error('Database connection failed'));

    const event = {
      jobId: 'test-job-123',
      ocr: { metadata: { pages: 1 } }
    };

    await expect(handler(event)).rejects.toThrow('LLM_EXTRACTION_ERROR: Database connection failed');
  });

  it('should handle LLM extraction failures', async () => {
    __setAiFns({
      generateObject: async () => {
        throw new Error('LLM API timeout');
      }
    });

    const event = {
      jobId: 'test-job-123',
      ocr: { metadata: { pages: 1 } }
    };

    await expect(handler(event)).rejects.toThrow('LLM_EXTRACTION_ERROR: LLM API timeout');
  });

  // New test cases as per story requirements
  it('should throw error when extraction produces no data', async () => {
    __setAiFns({
      generateObject: async () => ({
        object: null, // No data produced
        usage: { totalTokens: 500 },
        reasoning: 'No reasoning',
        finishReason: 'stop',
        warnings: [],
        request: {},
        response: {},
        rawResponse: {},
        providerMetadata: {},
        toJsonResponse: () => ({})
      })
    });

    const event = {
      jobId: 'test-job-123',
      ocr: { metadata: { pages: 1 } }
    };

    await expect(handler(event)).rejects.toThrow('LLM_EXTRACTION_ERROR: Extraction produced no data');
  });

  it('should persist confidence score when available', async () => {
    __setAiFns({
      generateObject: async () => ({
        object: {
          invoice_date: {
            value: '2024-01-15',
            reasoning: 'Found in header',
            confidence: 'high'
          }
        },
        usage: { totalTokens: 800 },
        reasoning: 'Generated object',
        finishReason: 'stop',
        warnings: [],
        request: {},
        response: {},
        rawResponse: {},
        providerMetadata: {},
        toJsonResponse: () => ({})
      })
    });

    const event = {
      jobId: 'test-job-123',
      ocr: { metadata: { pages: 1 } }
    };

    await handler(event); // Don't need result since it's unused

    expect(mockUpsertJobResult).toHaveBeenCalledWith({
      jobId: 'test-job-123',
      extractedData: expect.any(Object),
      confidence: expect.any(Number), // extractStructured calculates confidence
      tokensUsed: 800
    });
  });
});