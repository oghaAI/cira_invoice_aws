import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handler } from './llm-extraction';
import { __setAiFns, __resetAiFns } from '../services/llm/client';

// Mock DatabaseClient
const mockGetJobResult = vi.fn();
const mockUpsertJobResult = vi.fn();

vi.mock('@cira/database', () => ({
  DatabaseClient: vi.fn().mockImplementation(() => ({
    getJobResult: mockGetJobResult,
    upsertJobResult: mockUpsertJobResult
  }))
}));

describe('llm-extraction handler', () => {
  beforeEach(() => {
    // Mock environment variables
    vi.stubEnv('AZURE_OPENAI_ENDPOINT', 'https://test.openai.azure.com');
    vi.stubEnv('AZURE_OPENAI_API_KEY', 'test-key');
    vi.stubEnv('AZURE_OPENAI_DEPLOYMENT', 'test-deployment');
    vi.stubEnv('DB_HOST', 'test-host');
    vi.stubEnv('DB_NAME', 'test-db');

    // Reset mocks
    mockGetJobResult.mockReset();
    mockUpsertJobResult.mockReset();

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
      status: 'ocr_completed'
    };

    const result = await handler(event);

    expect(result.status).toBe('llm_completed');
    expect(result.jobId).toBe('test-job-123');
    expect(result.extractedData).toBeDefined();
    expect(result.tokensUsed).toBe(1500);

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
      tokensUsed: 1500
    });
  });

  it('should return validation error for missing jobId', async () => {
    const event = { status: 'ocr_completed' };

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(result.error_code).toBe('VALIDATION');
    expect(result.message).toBe('Missing jobId');
  });

  it('should return validation error when OCR not completed', async () => {
    const event = {
      jobId: 'test-job-123',
      status: 'processing'
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(result.error_code).toBe('VALIDATION');
    expect(result.message).toBe('OCR not completed');
  });

  it('should return validation error when no OCR text available', async () => {
    mockGetJobResult.mockResolvedValue(null);

    const event = {
      jobId: 'test-job-123',
      status: 'ocr_completed'
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(result.error_code).toBe('VALIDATION');
    expect(result.message).toBe('No OCR text available');
  });

  it('should return validation error when OCR text is empty', async () => {
    mockGetJobResult.mockResolvedValue({ rawOcrText: null });

    const event = {
      jobId: 'test-job-123',
      status: 'ocr_completed'
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(result.error_code).toBe('VALIDATION');
    expect(result.message).toBe('No OCR text available');
  });

  it('should handle field_reasoning and field_confidence correctly', async () => {
    const event = {
      jobId: 'test-job-123',
      status: 'ocr_completed'
    };

    const result = await handler(event);

    expect(result.extractedData).toBeDefined();
    expect(result.extractedData.invoice_date?.reasoning).toBe('Found in header section');
    expect(result.extractedData.invoice_date?.confidence).toBe('high');
    expect(result.extractedData.vendor_name?.reasoning).toBe('Not present in document');
    expect(result.extractedData.vendor_name?.confidence).toBe('low');
  });

  it('should persist JSONB including field_reasoning and field_confidence', async () => {
    const event = {
      jobId: 'test-job-123',
      status: 'ocr_completed'
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
      status: 'ocr_completed'
    };

    const result = await handler(event);

    expect(result.extractedData.invoice_date).toBeDefined();
    expect(result.extractedData.vendor_name).toBeUndefined(); // Missing optional fields
    expect(result.tokensUsed).toBe(800);
  });

  it('should handle database errors gracefully', async () => {
    mockGetJobResult.mockRejectedValue(new Error('Database connection failed'));

    const event = {
      jobId: 'test-job-123',
      status: 'ocr_completed'
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(502);
    expect(result.error_code).toBe('SERVER');
    expect(result.message).toBe('LLM extraction error');
  });

  it('should handle LLM extraction failures', async () => {
    __setAiFns({
      generateObject: async () => {
        throw new Error('LLM API timeout');
      }
    });

    const event = {
      jobId: 'test-job-123',
      status: 'ocr_completed'
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(502);
    expect(result.error_code).toBe('SERVER');
    expect(result.message).toBe('LLM extraction error');
  });
});