import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { decryptSecret } from '../../common/crypto/secret.util';

const GST_CONFIG_KEY = 'gst_api_config';

type GspProduct = 'gst' | 'einvoice' | 'ewaybill';

/**
 * Platform-wide GSP account settings. WhiteBooks issues a SEPARATE Client
 * ID/Secret per product (GST, e-Invoice, e-Way Bill). Base URL depends only on
 * the environment (sandbox → apisandbox.whitebooks.in, production →
 * api.whitebooks.in) and is shared across products.
 */
export interface GspConfig {
  provider: string;          // 'whitebooks'
  environment: string;       // 'sandbox' | 'production'
  baseUrl: string;           // derived from environment
  email: string;             // WhiteBooks account email
  ipAddress: string;         // whitelisted public IP registered with NIC/GSP
  gst: { clientId: string; clientSecret: string };
  einvoice: { clientId: string; clientSecret: string };
  ewaybill: { clientId: string; clientSecret: string };
}

/** Per-taxpayer NIC API credentials (created under the taxpayer's GST login). */
export interface GspCredentials {
  gstin: string;
  username: string;
  password: string;
}

interface CachedToken { token: string; expiresAt: number; }

/**
 * WhiteBooks GSP client (developer.whitebooks.in).
 *
 * WhiteBooks is a GST Suvidha Provider that wraps NIC's AES/RSA encryption:
 * you send plain JSON + credentials and receive plain JSON back. Auth flow:
 *   GET  {base}/ewaybillapi/v1.03/authenticate   -> auth-token (session, ~1h/6h)
 *   POST {base}/ewaybillapi/v1.03/ewayapi/...     with the auth-token header
 * The e-Invoice APIs follow the same credential pattern under /einvoice/...
 *
 * Credentials split by scope:
 *  - platform (this service, from master-admin GST config / env): client_id,
 *    client_secret, account email, base URL, environment, whitelisted IP.
 *  - taxpayer (Organization row): gstin, username, password.
 *
 * See Api-docs/*.json (OpenAPI) for the exact query/header/body contract.
 */
@Injectable()
export class WhiteBooksService {
  private readonly logger = new Logger(WhiteBooksService.name);
  // Auth token cached per taxpayer GSTIN.
  private tokenCache = new Map<string, CachedToken>();

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  // ── Configuration ──

  /** Base URL for an environment (shared across products). */
  private static baseUrlFor(environment: string): string {
    return environment === 'production' ? 'https://api.whitebooks.in' : 'https://apisandbox.whitebooks.in';
  }

  /** Resolve platform GSP config: DB (master-admin) first, env as fallback. */
  async resolveConfig(): Promise<GspConfig | null> {
    const row = await this.prisma.platformSetting.findUnique({ where: { key: GST_CONFIG_KEY } });
    const c = (row?.value as any) ?? {};
    const environment = c.environment ?? this.config.get('GSP_ENV') ?? 'sandbox';
    const baseUrl = (c.baseUrl || this.config.get('GSP_BASE_URL') || WhiteBooksService.baseUrlFor(environment)).replace(/\/+$/, '');
    // Legacy single-pair fallback (older configs / env vars).
    const legacyId = c.clientId ?? this.config.get('GSP_CLIENT_ID') ?? '';
    const legacySecret = c.clientSecret ? decryptSecret(c.clientSecret) : (this.config.get('GSP_CLIENT_SECRET') ?? '');
    const pair = (idKey: string, secKey: string) => ({
      clientId: c[idKey] || legacyId,
      clientSecret: c[secKey] ? decryptSecret(c[secKey]) : legacySecret,
    });
    const cfg: GspConfig = {
      provider: c.provider ?? this.config.get('GSP_PROVIDER') ?? 'whitebooks',
      environment,
      baseUrl,
      email: c.email ?? this.config.get('GSP_EMAIL') ?? '',
      ipAddress: c.ipAddress ?? this.config.get('GSP_IP_ADDRESS') ?? '',
      gst: pair('gstClientId', 'gstClientSecret'),
      einvoice: pair('einvoiceClientId', 'einvoiceClientSecret'),
      ewaybill: pair('ewaybillClientId', 'ewaybillClientSecret'),
    };
    const anyProduct = (['gst', 'einvoice', 'ewaybill'] as GspProduct[]).some((p) => cfg[p].clientId && cfg[p].clientSecret);
    return cfg.baseUrl && cfg.email && anyProduct ? cfg : null;
  }

  /** Credentials for a specific WhiteBooks product; throws if that product isn't configured. */
  private productCreds(cfg: GspConfig, product: GspProduct): { clientId: string; clientSecret: string } {
    const p = cfg[product];
    if (!p.clientId || !p.clientSecret) {
      throw new BadRequestException(`WhiteBooks ${product} API credentials are not set. Add the ${product} Client ID & Secret in the master panel → GST API Config.`);
    }
    return p;
  }

  /** True when platform GSP config is present AND the org has taxpayer creds. */
  async isConfigured(org: { gstin?: string | null; gspUsername?: string | null; gspPassword?: string | null }): Promise<boolean> {
    const cfg = await this.resolveConfig();
    return !!(cfg && org?.gstin && org?.gspUsername && org?.gspPassword);
  }

  private creds(org: { gstin?: string | null; gspUsername?: string | null; gspPassword?: string | null }): GspCredentials {
    if (!org?.gstin || !org?.gspUsername || !org?.gspPassword) {
      throw new BadRequestException('Organization is missing NIC API credentials (GSTIN / username / password). Add them in Settings → GST APIs.');
    }
    return { gstin: org.gstin, username: org.gspUsername, password: decryptSecret(org.gspPassword) };
  }

  // ── HTTP ──

  private async http(method: 'GET' | 'POST', url: string, headers: Record<string, string>, body?: unknown): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(url, {
        method,
        headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      let json: any;
      try { json = text ? JSON.parse(text) : {}; } catch { json = { status_cd: '0', raw: text }; }
      if (!res.ok) {
        throw new ServiceUnavailableException(`GSP ${res.status}: ${json?.status_desc ?? json?.error ?? text?.slice(0, 200)}`);
      }
      return json;
    } catch (e: any) {
      if (e?.name === 'AbortError') throw new ServiceUnavailableException('GSP request timed out');
      if (e instanceof ServiceUnavailableException || e instanceof BadRequestException) throw e;
      throw new ServiceUnavailableException(`GSP request failed: ${e?.message ?? e}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private qs(params: Record<string, string | undefined>): string {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.append(k, v);
    return u.toString();
  }

  // ── Auth ──

  /** Authenticate a taxpayer for a product and return the session token. Cached per product+GSTIN. */
  async authenticate(cfg: GspConfig, creds: GspCredentials, product: GspProduct): Promise<string> {
    const cacheKey = `${product}:${creds.gstin}`;
    const cached = this.tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

    const pc = this.productCreds(cfg, product);
    // email/username/password are query params; the rest are headers (per OpenAPI).
    const url = `${cfg.baseUrl}/ewaybillapi/v1.03/authenticate?` +
      this.qs({ email: cfg.email, username: creds.username, password: creds.password });
    const res = await this.http('GET', url, {
      ip_address: cfg.ipAddress, client_id: pc.clientId, client_secret: pc.clientSecret, gstin: creds.gstin,
    });

    const data = res?.data ?? res;
    const token = data?.authtoken ?? data?.AuthToken ?? data?.['auth-token'] ?? data?.authToken ?? res?.authtoken;
    if (!token) throw new ServiceUnavailableException(`GSP auth returned no token: ${res?.status_desc ?? JSON.stringify(res).slice(0, 200)}`);

    // Sandbox tokens ~1h, production ~6h. Cache conservatively.
    const ttl = (cfg.environment === 'production' ? 6 * 60 : 55) * 60_000;
    this.tokenCache.set(cacheKey, { token, expiresAt: Date.now() + ttl });
    return token;
  }

  /** Force a fresh auth (used by the admin "Test connection" button). Defaults to the e-Way Bill product. */
  async testConnection(
    org: { gstin?: string | null; gspUsername?: string | null; gspPassword?: string | null },
    product: GspProduct = 'ewaybill',
  ): Promise<{ ok: boolean; environment: string; message: string }> {
    const cfg = await this.resolveConfig();
    if (!cfg) throw new BadRequestException('GSP is not configured. Set the product Client ID/Secret and account email in the master panel → GST API Config.');
    const creds = this.creds(org);
    this.tokenCache.delete(`${product}:${creds.gstin}`);
    await this.authenticate(cfg, creds, product);
    return { ok: true, environment: cfg.environment, message: `Authenticated ${creds.gstin} for ${product} via ${cfg.provider} (${cfg.environment}).` };
  }

  // ── e-Way Bill ──

  /** Generate an e-Way Bill via NIC. `payload` is the NIC genewaybill JSON. */
  async generateEwayBill(
    org: { gstin?: string | null; gspUsername?: string | null; gspPassword?: string | null },
    payload: Record<string, unknown>,
  ): Promise<{ ewbNo: string; ewbDate: string; validUpto: string; raw: any }> {
    const cfg = await this.resolveConfig();
    if (!cfg) throw new BadRequestException('GSP is not configured.');
    const creds = this.creds(org);
    const pc = this.productCreds(cfg, 'ewaybill');
    const token = await this.authenticate(cfg, creds, 'ewaybill');

    const url = `${cfg.baseUrl}/ewaybillapi/v1.03/ewayapi/genewaybill?` + this.qs({ email: cfg.email });
    const res = await this.http('POST', url, {
      ip_address: cfg.ipAddress, client_id: pc.clientId, client_secret: pc.clientSecret,
      gstin: creds.gstin, 'auth-token': token,
    }, payload);

    const data = res?.data ?? res;
    const ewbNo = data?.ewayBillNo ?? data?.ewbNo ?? data?.EwbNo;
    if (!ewbNo) throw new ServiceUnavailableException(`e-Way Bill not generated: ${res?.status_desc ?? JSON.stringify(res).slice(0, 300)}`);
    return {
      ewbNo: String(ewbNo),
      ewbDate: data?.ewayBillDate ?? new Date().toISOString(),
      validUpto: data?.validUpto ?? data?.validUpTo ?? new Date().toISOString(),
      raw: data,
    };
  }

  /** Look up counterparty GSTIN details (name, address, status) via NIC. */
  async getGstinDetails(
    org: { gstin?: string | null; gspUsername?: string | null; gspPassword?: string | null },
    lookupGstin: string,
  ): Promise<any> {
    const cfg = await this.resolveConfig();
    if (!cfg) throw new BadRequestException('GSP is not configured.');
    const creds = this.creds(org);
    const pc = this.productCreds(cfg, 'ewaybill');
    const token = await this.authenticate(cfg, creds, 'ewaybill');
    const url = `${cfg.baseUrl}/ewaybillapi/v1.03/ewayapi/getgstindetails?` +
      this.qs({ email: cfg.email, GSTIN: lookupGstin });
    const res = await this.http('GET', url, {
      ip_address: cfg.ipAddress, client_id: pc.clientId, client_secret: pc.clientSecret,
      gstin: creds.gstin, 'auth-token': token,
    });
    return res?.data ?? res;
  }

  // ── e-Invoice (IRN) ──

  /** Generate an IRN via NIC. `payload` is the e-Invoice schema (V1_03) JSON. */
  async generateIrn(
    org: { gstin?: string | null; gspUsername?: string | null; gspPassword?: string | null },
    payload: Record<string, unknown>,
  ): Promise<{ irn: string; signedInvoice?: string; signedQr?: string; ackNo?: string; raw: any }> {
    const cfg = await this.resolveConfig();
    if (!cfg) throw new BadRequestException('GSP is not configured.');
    const creds = this.creds(org);
    const pc = this.productCreds(cfg, 'einvoice');
    const token = await this.authenticate(cfg, creds, 'einvoice');

    const url = `${cfg.baseUrl}/einvoice/type/GENERATE/version/V1_03?` +
      this.qs({ email: cfg.email, username: creds.username });
    const res = await this.http('POST', url, {
      ip_address: cfg.ipAddress, client_id: pc.clientId, client_secret: pc.clientSecret,
      gstin: creds.gstin, 'auth-token': token,
    }, payload);

    const data = res?.data ?? res;
    const irn = data?.Irn ?? data?.irn;
    if (!irn) throw new ServiceUnavailableException(`IRN not generated: ${res?.status_desc ?? JSON.stringify(res).slice(0, 300)}`);
    return {
      irn: String(irn),
      signedInvoice: data?.SignedInvoice ?? data?.signedInvoice,
      signedQr: data?.SignedQRCode ?? data?.signedQr,
      ackNo: data?.AckNo != null ? String(data.AckNo) : undefined,
      raw: data,
    };
  }
}
