import { Langfuse } from 'langfuse';

// Check if Langfuse is configured
const langfusePublicKey = process.env['LANGFUSE_PUBLIC_KEY'];
const langfuseSecretKey = process.env['LANGFUSE_SECRET_KEY'];
const langfuseHost = process.env['LANGFUSE_HOST']; // Optional, defaults to cloud.langfuse.com

let langfuse: Langfuse | null = null;

// Only initialize if Langfuse credentials are provided
if (langfusePublicKey && langfuseSecretKey) {
  const config: any = {
    publicKey: langfusePublicKey,
    secretKey: langfuseSecretKey,
    // Flush aggressively for Lambda environments
    flushAt: 1, // Flush after each trace
    flushInterval: 100, // Flush every 100ms
    requestTimeout: 5000 // 5 second timeout for requests
  };

  // Only add baseUrl if it's actually defined (Langfuse defaults to cloud if not provided)
  if (langfuseHost) {
    config.baseUrl = langfuseHost;
  }

  langfuse = new Langfuse(config);
} else {
  console.warn(
    'Langfuse tracing not initialized: LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY environment variables not set'
  );
}

/**
 * Export the Langfuse client for use in other modules
 */
export { langfuse };

/**
 * Flush all pending traces before Lambda execution ends.
 * Call this at the end of your Lambda handler to ensure traces are sent.
 */
export async function flushSpans(): Promise<void> {
  if (langfuse) {
    try {
      await langfuse.flushAsync();
    } catch (error) {
      console.error('Failed to flush spans to Langfuse:', error);
    }
  }
}

/**
 * Shutdown the Langfuse client (useful for cleanup)
 */
export async function shutdown(): Promise<void> {
  if (langfuse) {
    await langfuse.shutdown();
  }
}
