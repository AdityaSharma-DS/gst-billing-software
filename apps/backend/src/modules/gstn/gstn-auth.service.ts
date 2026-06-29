import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CachedToken { token: string; expiresAt: number; }

/**
 * Handles NIC/GSTN authentication. Tokens are valid 1h (sandbox) / 6h (production),
 * so we cache per GSTIN and refresh on expiry.
 * See Api-docs/e-Invoice API Flow.pdf and Sandbox Credentials.pdf.
 */
@Injectable()
export class GstnAuthService {
  private readonly logger = new Logger(GstnAuthService.name);
  private cache = new Map<string, CachedToken>();

  constructor(private readonly config: ConfigService) {}

  async getToken(gstin: string): Promise<string> {
    const cached = this.cache.get(gstin);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

    const token = await this.authenticate(gstin);
    // Conservative TTL; real expiry comes from the auth response.
    this.cache.set(gstin, { token, expiresAt: Date.now() + 55 * 60_000 });
    return token;
  }

  private async authenticate(gstin: string): Promise<string> {
    // TODO: POST to `${EINVOICE_BASE_URL}/eivital/v1.04/auth` with encrypted payload,
    // decrypt SEK, derive session token. For now return a placeholder.
    this.logger.warn(`GSTN auth not yet wired for ${gstin} — returning placeholder token`);
    return 'PLACEHOLDER_TOKEN';
  }
}
