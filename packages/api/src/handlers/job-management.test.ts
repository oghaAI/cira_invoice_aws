import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

// Mock database module
vi.mock('@cira/database', () => {
  return {
    DatabaseClient: vi.fn().mockImplementation(() => ({
      createJob: vi.fn(async ({ clientId, pdfUrl }: { clientId: string | null; pdfUrl: string }) => ({
        id: '11111111-1111-4111-8111-111111111111',
        clientId,
        status: 'queued',
        pdfUrl,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
        completedAt: null,
        errorMessage: null
      })),
      getJobById: vi.fn(async (id: string) => {
        if (id === '11111111-1111-4111-8111-111111111111') {
          return {
            id,
            clientId: 'client-1',
            status: 'queued',
            pdfUrl: 'https://example.com/a.pdf',
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
            updatedAt: new Date('2025-01-01T00:00:00.000Z'),
            completedAt: null,
            errorMessage: null
          };
        }
        if (id === '22222222-2222-4222-8222-222222222222') {
          return {
            id,
            clientId: 'client-1',
            status: 'completed',
            pdfUrl: 'https://example.com/b.pdf',
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
            updatedAt: new Date('2025-01-01T00:00:00.000Z'),
            completedAt: new Date('2025-01-01T00:10:00.000Z'),
            errorMessage: null
          };
        }
        if (id === '33333333-3333-4333-8333-333333333333') {
          return {
            id,
            clientId: 'client-2',
            status: 'completed',
            pdfUrl: 'https://example.com/c.pdf',
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
            updatedAt: new Date('2025-01-01T00:00:00.000Z'),
            completedAt: new Date('2025-01-01T00:10:00.000Z'),
            errorMessage: null
          };
        }
        return null;
      }),
      getJobResult: vi.fn(async (jobId: string) => {
        if (jobId === '22222222-2222-4222-8222-222222222222') {
          return {
            id: 'result-1',
            jobId,
            extractedData: { invoice_number: { value: '12345', confidence: 'high' } },
            confidenceScore: 0.85,
            tokensUsed: 1500,
            rawOcrText: '# Invoice\n\nInvoice Number: 12345\nAmount: $100.00',
            ocrProvider: 'mistral',
            ocrDurationMs: 5000,
            ocrPages: 1,
            createdAt: new Date('2025-01-01T00:05:00.000Z')
          };
        }
        return null;
      }),
      healthCheck: vi.fn(async () => true),
      end: vi.fn(async () => {})
    }))
  };
});

// Import after mocks
import { handler } from './job-management';

function baseEvent(): APIGatewayProxyEvent {
  return {
    resource: '/jobs',
    path: '/jobs',
    httpMethod: 'POST',
    headers: {},
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: '123',
      apiId: 'api',
      authorizer: null,
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
      identity: {
        apiKey: 'key',
        apiKeyId: 'client-1',
        accessKey: null,
        accountId: null,
        caller: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        sourceIp: '127.0.0.1',
        user: null,
        userAgent: 'vitest',
        userArn: null,
        principalOrgId: null,
        clientCert: null
      },
      path: '/jobs',
      requestId: 'req',
      requestTimeEpoch: Date.now(),
      resourceId: 'res',
      resourcePath: '/jobs',
      stage: 'test'
    },
    body: '',
    isBase64Encoded: false
  } as unknown as APIGatewayProxyEvent;
}

describe('job-management handler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('returns 400 when pdf_url is missing', async () => {
    const evt = baseEvent();
    evt.body = JSON.stringify({});
    const res = await handler(evt);
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error_code).toBe('VALIDATION_ERROR');
  });

  it('creates job with valid pdf_url', async () => {
    const evt = baseEvent();
    evt.body = JSON.stringify({ pdf_url: 'https://example.com/invoice.pdf' });
    const res = await handler(evt);
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.job_id).toBeDefined();
    expect(body.status).toBe('queued');
    expect(body.created_at).toBeDefined();
  });

  it('validates job_id on status endpoint', async () => {
    const evt = baseEvent();
    evt.httpMethod = 'GET';
    (evt as any).requestContext.httpMethod = 'GET';
    (evt as any).resource = '/jobs/{jobId}/status';
    (evt as any).pathParameters = { jobId: 'not-a-uuid' };
    const res = await handler(evt);
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error_code).toBe('VALIDATION_ERROR');
  });

  it('returns health info at root', async () => {
    const evt = baseEvent();
    evt.httpMethod = 'GET';
    (evt as any).requestContext.httpMethod = 'GET';
    (evt as any).resource = '/';
    (evt as any).path = '/';
    const res = await handler(evt);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBeDefined();
    expect(body.version).toBeDefined();
    expect(body.database).toBe('connected');
  });

  describe('GET /jobs/{jobId}/result', () => {

    it('returns 400 for invalid job UUID', async () => {
      const evt = baseEvent();
      evt.httpMethod = 'GET';
      (evt as any).requestContext.httpMethod = 'GET';
      (evt as any).resource = '/jobs/{jobId}/result';
      (evt as any).path = '/jobs/not-a-uuid/result';
      (evt as any).pathParameters = { jobId: 'not-a-uuid' };
      const res = await handler(evt);
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error_code).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('job_id must be a valid UUID');
    });

    it('returns 404 when job not found', async () => {
      const evt = baseEvent();
      evt.httpMethod = 'GET';
      (evt as any).requestContext.httpMethod = 'GET';
      (evt as any).resource = '/jobs/{jobId}/result';
      (evt as any).path = '/jobs/99999999-9999-4999-8999-999999999999/result';
      (evt as any).pathParameters = { jobId: '99999999-9999-4999-8999-999999999999' };
      const res = await handler(evt);
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error_code).toBe('NOT_FOUND');
      expect(body.message).toBe('Job not found');
    });

    it('returns 404 when job not completed', async () => {
      const evt = baseEvent();
      evt.httpMethod = 'GET';
      (evt as any).requestContext.httpMethod = 'GET';
      (evt as any).resource = '/jobs/{jobId}/result';
      (evt as any).path = '/jobs/11111111-1111-4111-8111-111111111111/result';
      (evt as any).pathParameters = { jobId: '11111111-1111-4111-8111-111111111111' }; // queued job
      const res = await handler(evt);
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error_code).toBe('NOT_FOUND');
      expect(body.message).toBe('Job not completed');
    });

    it('returns 404 when accessing different client job', async () => {
      const evt = baseEvent();
      evt.httpMethod = 'GET';
      (evt as any).requestContext.httpMethod = 'GET';
      (evt as any).resource = '/jobs/{jobId}/result';
      (evt as any).path = '/jobs/33333333-3333-4333-8333-333333333333/result';
      (evt as any).pathParameters = { jobId: '33333333-3333-4333-8333-333333333333' }; // client-2 job
      (evt as any).requestContext.identity.apiKeyId = 'client-1'; // different client
      const res = await handler(evt);
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error_code).toBe('NOT_FOUND');
      expect(body.message).toBe('Job not found');
    });

    it('returns 404 when job result not found', async () => {
      const evt = baseEvent();
      evt.httpMethod = 'GET';
      (evt as any).requestContext.httpMethod = 'GET';
      (evt as any).resource = '/jobs/{jobId}/result';
      (evt as any).path = '/jobs/33333333-3333-4333-8333-333333333333/result';
      (evt as any).pathParameters = { jobId: '33333333-3333-4333-8333-333333333333' }; // completed job but no result
      (evt as any).requestContext.identity.apiKeyId = 'client-2';
      const res = await handler(evt);
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error_code).toBe('NOT_FOUND');
      expect(body.message).toBe('Result not found');
    });

    it('returns success with complete result data including OCR markdown', async () => {
      const evt = baseEvent();
      evt.httpMethod = 'GET';
      (evt as any).requestContext.httpMethod = 'GET';
      (evt as any).resource = '/jobs/{jobId}/result';
      (evt as any).path = '/jobs/22222222-2222-4222-8222-222222222222/result';
      (evt as any).pathParameters = { jobId: '22222222-2222-4222-8222-222222222222' };
      (evt as any).requestContext.identity.apiKeyId = 'client-1';
      const res = await handler(evt);
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);

      expect(body.job_id).toBe('22222222-2222-4222-8222-222222222222');
      expect(body.extracted_data).toEqual({
        invoice_number: { value: '12345', confidence: 'high' }
      });
      expect(body.confidence_score).toBe(0.85);
      expect(body.tokens_used).toBe(1500);
      expect(body.raw_ocr_markdown).toBe('# Invoice\n\nInvoice Number: 12345\nAmount: $100.00');
    });

  });
});

