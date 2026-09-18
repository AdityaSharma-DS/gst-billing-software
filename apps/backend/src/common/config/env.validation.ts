/**
 * Fail-fast validation of required environment at boot. Wired into
 * ConfigModule.forRoot({ validate }). Throwing here aborts startup with a clear
 * message instead of the app running in an insecure/half-configured state.
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const isProd = config.NODE_ENV === 'production' || !!config.VERCEL;
  const errors: string[] = [];

  const jwt = String(config.JWT_SECRET ?? '');
  if (jwt.length < 16) {
    errors.push('JWT_SECRET must be set to a random string of at least 16 characters');
  }
  if (!config.DATABASE_URL) {
    errors.push('DATABASE_URL is required');
  }
  if (isProd) {
    if (!config.APP_DATABASE_URL) {
      errors.push('APP_DATABASE_URL (least-privilege NOBYPASSRLS role) is required in production');
    }
    if (!config.ENCRYPTION_KEY) {
      errors.push('ENCRYPTION_KEY is required in production (encrypts stored GSP/taxpayer secrets at rest)');
    }
  }

  if (errors.length) {
    throw new Error('Invalid environment configuration:\n  - ' + errors.join('\n  - '));
  }
  return config;
}
