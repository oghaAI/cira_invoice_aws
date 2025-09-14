import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const getJobByIdMock = vi.fn();
const getJobResultMock = vi.fn();

vi.mock('@cira/database', () => {
  return {
    DatabaseClient: vi.fn().mockImplementation(() => ({
      getJobById: getJobByIdMock,
      getJobResult: getJobResultMock,
      healthCheck: vi.fn(async () => true),
      end: vi.fn(async () => {})
    }))
  };
});

import { handler } from './job-management';

function baseGetEvent(jobId: string, qs: Record<string, string> = {}): APIGatewayProxyEvent {
  const queryStringParameters = Object.keys(qs).length ? qs : null;
  return {
    resource: '/jobs/{jobId}/ocr',
    path: `/jobs/${jobId}/ocr`,
    httpMethod: 'GET',
    headers: {},
    multiValueHeaders: {},
    queryStringParameters,
    multiValueQueryStringParameters: null,
    pathParameters: { jobId },
    stageVariables: null,
    requestContext: {
      accountId: '123',
      apiId: 'api',
      authorizer: null,
      protocol: 'HTTP/1.1',
      httpMethod: 'GET',
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
      path: `/jobs/${jobId}/ocr`,
      requestId: 'req',
      requestTimeEpoch: Date.now(),
      resourceId: 'res',
      resourcePath: '/jobs/{jobId}/ocr',
      stage: 'test'
    },
    body: '',
    isBase64Encoded: false
  } as unknown as APIGatewayProxyEvent;
}

describe('job-management OCR retrieval', () => {
  beforeEach(() => {
    // Ensure unit tests don't attempt to call AWS Secrets Manager
    delete (process.env as any).DATABASE_SECRET_ARN;
    getJobByIdMock.mockReset();
    getJobResultMock.mockReset();
    getJobByIdMock.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      clientId: 'client-1',
      status: 'processing',
      pdfUrl: 'https://example.com/x.pdf',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      completedAt: null,
      errorMessage: null
    });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns truncated OCR text by default', async () => {
    const longText = 'A'.repeat(300_000); // 300KB
    getJobResultMock.mockResolvedValue({
      id: 'r1',
      jobId: '11111111-1111-1111-1111-111111111111',
      extractedData: null,
      confidenceScore: null,
      tokensUsed: null,
      rawOcrText: longText,
      ocrProvider: 'mock',
      ocrDurationMs: 123,
      ocrPages: 2,
      createdAt: new Date('2025-01-01T00:00:00.000Z')
    });

    const evt = baseGetEvent('11111111-1111-1111-1111-111111111111');
    const res = await handler(evt);
    // Debugging output for clarity if failing
    if (res.statusCode !== 200) {
      // eslint-disable-next-line no-console
      console.error('OCR endpoint response:', res.statusCode, res.body);
    }
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.provider).toBe('mock');
    expect(body.truncated).toBe(true);
    expect((body.raw_ocr_text as string).length).toBeGreaterThan(0);
  });

  it('returns full OCR text when raw=true', async () => {
    const text = 'Hello';
    getJobResultMock.mockResolvedValue({
      id: 'r1',
      jobId: '11111111-1111-1111-1111-111111111111',
      extractedData: null,
      confidenceScore: null,
      tokensUsed: null,
      rawOcrText: text,
      ocrProvider: 'mock',
      ocrDurationMs: 1,
      ocrPages: null,
      createdAt: new Date('2025-01-01T00:00:00.000Z')
    });

    const evt = baseGetEvent('11111111-1111-1111-1111-111111111111', { raw: 'true' });
    const res = await handler(evt);
    if (res.statusCode !== 200) {
      // eslint-disable-next-line no-console
      console.error('OCR endpoint response:', res.statusCode, res.body);
    }
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.truncated).toBe(false);
    expect(body.raw_ocr_text).toBe(text);
  });
});
