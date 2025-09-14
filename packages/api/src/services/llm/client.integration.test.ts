import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { callLlm, type ChatMessage } from './client';

const run = process.env.RUN_LLM_INTEGRATION === '1';

describe('LLM Integration (Azure)', () => {
  it.runIf(run)('generate structured object with simple schema', { timeout: 120_000 }, async () => {
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT as string | undefined;
    const resource = process.env.AZURE_RESOURCE_NAME as string | undefined;
    const apiKey = process.env.AZURE_OPENAI_API_KEY as string | undefined;

    expect(deployment, 'AZURE_OPENAI_DEPLOYMENT must be set').toBeTruthy();
    expect(resource, 'AZURE_RESOURCE_NAME must be set').toBeTruthy();
    expect(apiKey, 'AZURE_OPENAI_API_KEY must be set').toBeTruthy();

    const schema = z.object({
      answer: z.string()
    });

    const messages: ChatMessage[] = [
      { role: 'user', content: 'Reply with an object where answer="ok".' }
    ];

    const res = await callLlm({ messages, schema, timeoutMs: 30_000, maxRetries: 0 });
    if (!res.success) {
      // eslint-disable-next-line no-console
      console.error('LLM integration error:', res.error);
    }
    expect(res.success).toBe(true);
    expect((res as any).data.answer).toBeDefined();
  });
});

