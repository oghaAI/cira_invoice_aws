import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DatabaseClient } from '@cira/database';
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
  console.log('Job Management Handler - Event:', JSON.stringify(event, null, 2));

  const creds = await getDbCredentials();
  const db = new DatabaseClient({
    host: process.env.DATABASE_PROXY_ENDPOINT,
    database: process.env.DATABASE_NAME,
    user: creds.user,
    password: creds.password,
    ssl: true
  });

  try {
    const { httpMethod, resource, pathParameters, body } = event as any;

    // Extract client_id from API Gateway context
    const clientId = event.requestContext.identity.apiKeyId || event.requestContext.apiKeyId || null;

    switch (httpMethod) {
      case 'POST': {
        if (resource === '/jobs') {
          const parsed = body ? JSON.parse(body) : {};
          const pdfUrl: string = parsed.pdfUrl;
          if (!pdfUrl) {
            return {
              statusCode: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
              body: JSON.stringify({ error: 'ValidationError', message: 'pdfUrl is required' })
            };
          }

          const job = await db.createJob({ clientId, pdfUrl });

          return {
            statusCode: 201,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
              id: job.id,
              status: job.status,
              createdAt: job.createdAt.toISOString()
            })
          };
        }
        break;
      }
      case 'GET': {
        if (resource === '/jobs/{jobId}' && pathParameters?.jobId) {
          const job = await db.getJobById(pathParameters.jobId);
          if (!job) {
            return {
              statusCode: 404,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
              body: JSON.stringify({ error: 'NotFound', message: 'Job not found' })
            };
          }
          return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify(job)
          };
        }

        if (resource === '/jobs/{jobId}/status' && pathParameters?.jobId) {
          const job = await db.getJobById(pathParameters.jobId);
          if (!job) {
            return {
              statusCode: 404,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
              body: JSON.stringify({ error: 'NotFound', message: 'Job not found' })
            };
          }
          return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ id: job.id, status: job.status })
          };
        }
        break;
      }
      default:
        return {
          statusCode: 405,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'MethodNotAllowed', message: `HTTP ${httpMethod} not supported` })
        };
    }

    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'NotFound', message: 'Endpoint not found' })
    };
  } catch (error) {
    console.error('Error in job management handler:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'InternalServerError', message: 'An error occurred processing your request' })
    };
  } finally {
    await db.end();
  }
};
