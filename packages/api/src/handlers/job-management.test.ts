import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

// Mock database module
vi.mock('@cira/database', () => {
  return {
    DatabaseClient: vi.fn().mockImplementation(() => ({
      createJob: vi.fn(async ({ clientId, pdfUrl }: { clientId: string | null; pdfUrl: string }) => ({
        id: '11111111-1111-1111-1111-111111111111',
        clientId,
        status: 'queued',
        pdfUrl,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
        completedAt: null,
        errorMessage: null
      })),
      getJobById: vi.fn(async (id: string) =>
        id === '11111111-1111-1111-1111-111111111111'
          ? {
              id,
              clientId: 'client-1',
              status: 'queued',
              pdfUrl: 'https://example.com/a.pdf',
              createdAt: new Date('2025-01-01T00:00:00.000Z'),
              updatedAt: new Date('2025-01-01T00:00:00.000Z'),
              completedAt: null,
              errorMessage: null
            }
          : null
      ),
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
});

