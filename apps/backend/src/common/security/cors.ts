import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * CORS policy. An explicit allowlist comes from CORS_ORIGINS (comma-separated).
 * With no list set: same-origin only in production (no cross-origin allowed),
 * permissive in local dev. The Vercel deployment serves the SPA and API on the
 * same origin, so no list is needed there.
 */
export function corsOptions(): CorsOptions {
  const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
  const list = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length) return { origin: list, credentials: true };
  return { origin: isProd ? false : true, credentials: true };
}
