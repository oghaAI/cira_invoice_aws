import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callLlm, getLlmClient, LlmError, __setAiFns, __resetAiFns } from './client';

// Helper to set minimal Azure env
function setAzureEnv() {
  process.env['AZURE_OPENAI_ENDPOINT'] = 'https://example.openai.azure.com';
  process.env['AZURE_OPENAI_API_KEY'] = 'test-key';
  process.env['AZURE_OPENAI_DEPLOYMENT'] = 'gpt-4o-mini';
  process.env['AZURE_OPENAI_API_VERSION'] = '2024-08-01-preview';
}

describe('LLM client env validation', () => {
  it('fails fast when required env missing', () => {
    delete process.env['AZURE_OPENAI_ENDPOINT'];
    delete process.env['AZURE_OPENAI_API_KEY'];
    delete process.env['AZURE_OPENAI_DEPLOYMENT'];
    expect(() => getLlmClient()).toThrowError(LlmError);
    try { getLlmClient(); } catch (e) {
      const le = e as LlmError;
      expect(le.category).toBe('VALIDATION');
    }
  });
});

describe('LLM client behavior', () => {
  beforeEach(() => {
    setAzureEnv();
    vi.restoreAllMocks();
    __resetAiFns();
  });

  it('aborts on timeout and maps to TIMEOUT', async () => {
    const spy = vi.fn(async (args: any) => {
      return new Promise((_resolve, reject) => {
        const sig: AbortSignal | undefined = args?.abortSignal;
        if (sig) sig.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })), { once: true });
      }) as any;
    });
    __setAiFns({ generateText: spy as any });

    const res = await callLlm({ messages: [{ role: 'user', content: 'ping' } as any], timeoutMs: 10 });
    expect(spy).toHaveBeenCalled();
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.category).toBe('TIMEOUT');
  });

  it('retries on 429 then succeeds', async () => {
    let call = 0;
    const spy = vi.fn(async () => {
      call++;
      if (call === 1) {
        const e: any = new Error('rate limit');
        e.status = 429;
        throw e;
      }
      return { text: 'ok', usage: { totalTokens: 5 } } as any;
    });
    __setAiFns({ generateText: spy as any });

    const res = await callLlm({ messages: [{ role: 'user', content: 'hello' } as any], timeoutMs: 2000, maxRetries: 1 });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(res.success).toBe(true);
  });

  it('does not retry on 401/403 and maps to AUTH', async () => {
    let calls = 0;
    const spy = vi.spyOn(global, 'fetch' as any).mockImplementation((_input: RequestInfo | URL) => {
      calls++;
      return Promise.resolve(new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } })) as any;
    });

    const res = await callLlm({ messages: [{ role: 'user', content: 'test' } as any], timeoutMs: 1000, maxRetries: 2 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.category).toBe('AUTH');
  });

  it('logs metadata without leaking content', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    __setAiFns({ generateText: vi.fn(async () => ({ text: 'OK-REDACTED', usage: { totalTokens: 7 } } as any)) });

    const out = await callLlm({ messages: [{ role: 'user', content: 'do not log this content' } as any] });
    expect(out.success).toBe(true);
    const allLogs = consoleSpy.mock.calls.flat().join(' ');
    expect(allLogs).toContain('azure_openai');
    expect(allLogs).toContain('status');
    expect(allLogs).toContain('model');
    expect(allLogs).not.toContain('do not log this content');
  });
});
