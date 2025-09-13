// Auto-load environment variables from .env at repo root if dotenv is available.
// Falls back silently if not installed; you can still export envs via shell.
(async () => {
  try {
    await import('dotenv/config');
  } catch {
    // no-op
  }
})();
