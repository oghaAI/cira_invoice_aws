import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DatabaseClient } from '@cira/database';
import { API_VERSION } from '../index';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

async function getDbCredentials() {
  const secretArn = process.env.DATABASE_SECRET_ARN;
  if (!secretArn) return { user: undefined, password: undefined };
  const client = new SecretsManagerClient({});
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const secretString = res.SecretString ?? Buffer.from(res.SecretBinary ?? '').toString('utf8');
  try {
    const parsed = JSON.parse(secretString || '{}');
    return { user: parsed.username, password: parsed.password } as { user?: string; password?: string };
  } catch {
    return { user: undefined, password: undefined };
  }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const start = Date.now();
  const log = (level: 'info' | 'error', message: string, extra?: Record<string, unknown>) =>
    console.log(
      JSON.stringify({
        level,
        message,
        timestamp: new Date().toISOString(),
        clientId: event.requestContext.identity.apiKeyId ?? null,
        method: event.httpMethod,
        resource: (event as any).resource,
        path: event.path,
        ...extra
      })
    );

  log('info', 'Incoming request');

  const creds = await getDbCredentials();
  const dbConfig: any = { ssl: true };
  if (process.env['DATABASE_PROXY_ENDPOINT']) dbConfig.host = process.env['DATABASE_PROXY_ENDPOINT'];
  if (process.env['DATABASE_NAME']) dbConfig.database = process.env['DATABASE_NAME'];
  if (creds.user) dbConfig.user = creds.user;
  if (creds.password) dbConfig.password = creds.password;
  const db = new DatabaseClient(dbConfig);

  try {
    const { httpMethod, resource, pathParameters, body } = event as any;

    // Extract client_id from API Gateway context
    const clientId = event.requestContext.identity.apiKeyId ?? null;

    switch (httpMethod) {
      case 'POST': {
        if (resource === '/jobs') {
          const parsed = body ? JSON.parse(body) : {};
          const pdfUrl: string | undefined = parsed.pdf_url || parsed.pdfUrl;

          // Basic validation per story: presence, https, length<=2048
          if (!pdfUrl) {
            return json(400, errorBody('VALIDATION_ERROR', 'pdf_url is required'));
          }
          if (typeof pdfUrl !== 'string' || pdfUrl.length > 2048) {
            return json(400, errorBody('VALIDATION_ERROR', 'pdf_url must be a string with max length 2048'));
          }
          let parsedUrl: URL;
          try {
            parsedUrl = new URL(pdfUrl);
          } catch {
            return json(400, errorBody('VALIDATION_ERROR', 'pdf_url must be a valid URL'));
          }
          if (parsedUrl.protocol !== 'https:') {
            return json(400, errorBody('VALIDATION_ERROR', 'pdf_url must use HTTPS'));
          }
          // Note: Skipping network HEAD accessibility check due to isolated subnet; will be handled downstream

          const job = await db.createJob({ clientId, pdfUrl });

          const response = {
            job_id: job.id,
            status: job.status,
            created_at: job.createdAt.toISOString()
          };
          log('info', 'Job created', { jobId: job.id });
          return json(201, response);
        }
        break;
      }
      case 'GET': {
        // Health check at root
        if (resource === '/') {
          const healthy = typeof (db as any).healthCheck === 'function' ? await (db as any).healthCheck() : true;
          const body = {
            status: healthy ? 'healthy' : 'down',
            version: API_VERSION,
            timestamp: new Date().toISOString(),
            database: healthy ? 'connected' : 'disconnected'
          } as const;
          return json(200, body);
        }

        if (resource === '/jobs/{jobId}' && pathParameters?.jobId) {
          const jobId = pathParameters.jobId;
          if (!isUuid(jobId)) {
            return json(400, errorBody('VALIDATION_ERROR', 'job_id must be a valid UUID'));
          }
          const job = await db.getJobById(jobId);
          if (!job) {
            return json(404, errorBody('NOT_FOUND', 'Job not found'));
          }
          if (clientId && job.clientId && clientId !== job.clientId) {
            return json(404, errorBody('NOT_FOUND', 'Job not found'));
          }
          return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify(job)
          };
        }

        if (resource === '/jobs/{jobId}/status' && pathParameters?.jobId) {
          const jobId = pathParameters.jobId;
          if (!isUuid(jobId)) {
            return json(400, errorBody('VALIDATION_ERROR', 'job_id must be a valid UUID'));
          }
          const job = await db.getJobById(jobId);
          if (!job) {
            return json(404, errorBody('NOT_FOUND', 'Job not found'));
          }
          if (clientId && job.clientId && clientId !== job.clientId) {
            return json(404, errorBody('NOT_FOUND', 'Job not found'));
          }
          return json(200, {
            id: job.id,
            status: job.status,
            created_at: job.createdAt.toISOString(),
            updated_at: job.updatedAt.toISOString(),
            completed_at: job.completedAt ? job.completedAt.toISOString() : undefined
          });
        }
        break;
      }
      default:
        return json(405, errorBody('METHOD_NOT_ALLOWED', `HTTP ${httpMethod} not supported`));
    }

    return json(404, errorBody('NOT_FOUND', 'Endpoint not found'));
  } catch (error) {
    log('error', 'Unhandled error in job management handler', {
      error: error instanceof Error ? error.message : String(error)
    });
    return json(500, errorBody('INTERNAL_SERVER_ERROR', 'An error occurred processing your request'));
  } finally {
    await db.end();
    log('info', 'Request completed', { duration_ms: Date.now() - start });
  }
};

function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key,Authorization'
    },
    body: JSON.stringify(body)
  };
}

function errorBody(error_code: string, message: string) {
  return { error_code, message };
}

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}
