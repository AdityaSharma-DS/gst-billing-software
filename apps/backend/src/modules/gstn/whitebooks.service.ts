import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
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
  // Shared sandbox test taxpayer (from the WhiteBooks Credentials page): used as
  // the NIC login for ALL tenants when environment is sandbox, so testing needs
  // no per-business credentials. Ignored in production.
  sandbox: { gstin: string; username: string; password: string };
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
      sandbox: {
        gstin: c.sandboxGstin ?? '',
        username: c.sandboxUsername ?? '',
        password: c.sandboxPassword ? decryptSecret(c.sandboxPassword) : '',
      },
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

  /**
   * Search a taxpayer's registered details by GSTIN via the GST API
   * (GET /public/search). Needs ONLY the GST product Client ID/Secret + account
   * email — no per-taxpayer NIC login or OTP. Ideal for counterparty auto-fill.
   */
  async searchTaxpayer(gstin: string): Promise<any> {
    const cfg = await this.resolveConfig();
    if (!cfg) throw new BadRequestException('GSP is not configured. Set the GST Client ID/Secret and account email in the master panel → GST API Config.');
    const pc = this.productCreds(cfg, 'gst');
    const url = `${cfg.baseUrl}/public/search?` + this.qs({ email: cfg.email, gstin });
    const res = await this.http('GET', url, { client_id: pc.clientId, client_secret: pc.clientSecret, ip_address: cfg.ipAddress });
    return res?.data ?? res;
  }

  /** True when platform GSP config is present AND the org has taxpayer creds. */
  async isConfigured(org: { gstin?: string | null; gspUsername?: string | null; gspPassword?: string | null }): Promise<boolean> {
    const cfg = await this.resolveConfig();
    return !!(cfg && org?.gstin && org?.gspUsername && org?.gspPassword);
  }

  private creds(org: { gstin?: string | null; gspUsername?: string | null; gspPassword?: string | null }, cfg?: GspConfig): GspCredentials {
    // Sandbox: use the shared sandbox test taxpayer from the master panel (so no
    // per-business creds are needed for testing).
    const s = cfg?.sandbox;
    if (cfg?.environment === 'sandbox' && s?.gstin && s?.username && s?.password) {
      return { gstin: s.gstin, username: s.username, password: s.password };
    }
    if (!org?.gstin || !org?.gspUsername || !org?.gspPassword) {
      throw new BadRequestException('Organization is missing NIC API credentials (GSTIN / username / password). Add them in Settings → GST APIs, or set a sandbox test taxpayer in the master panel.');
    }
    return { gstin: org.gstin, username: org.gspUsername, password: decryptSecret(org.gspPassword) };
  }

  // ── HTTP ──

  private async http(method: 'GET' | 'POST' | 'PUT', url: string, headers: Record<string, string>, body?: unknown): Promise<any> {
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

  /** NIC/GSP replies to logical failures with HTTP 200 + status_cd "0". Surface that as an error. */
  private nicError(res: any): string | null {
    const cd = res?.status_cd ?? res?.data?.status_cd;
    if (cd != null && String(cd) !== '1') return String(res?.status_desc ?? res?.data?.status_desc ?? res?.error?.message ?? res?.error ?? 'GST portal rejected the request');
    if (res?.error && res?.data == null) return typeof res.error === 'string' ? res.error : String(res.error?.message ?? 'GST portal error');
    return null;
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
    const creds = this.creds(org, cfg);
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
    const creds = this.creds(org, cfg);
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
    const creds = this.creds(org, cfg);
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
    const creds = this.creds(org, cfg);
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

  // ── GST Returns filing (GSTR-1 / GSTR-3B) — OTP + EVC, via the WhiteBooks GST product ──
  //
  // Two OTPs are involved (this is inherent to filing on pure API access, which
  // replaces the portal password login):
  //   1. Login OTP:  otprequest -> (user OTP) -> authtoken   → opens a session (txn)
  //   2. EVC OTP:    otpforevc  -> (user OTP) -> retevcfile  → signs & files
  // The session (txn) is cached, so repeat filings inside the window need only
  // the EVC OTP. The `txn` correlation id threads the whole flow; the exact
  // session-header semantics are per WhiteBooks' GST OpenAPI and should be
  // re-confirmed against a live sandbox run.

  private gstBase(cfg: GspConfig) { return { cfg, pc: this.productCreds(cfg, 'gst') }; }
  private gstHeaders(cfg: GspConfig, pc: { clientId: string; clientSecret: string }, extra: Record<string, string>) {
    return { ip_address: cfg.ipAddress, client_id: pc.clientId, client_secret: pc.clientSecret, ...extra };
  }
  private async gstCfg(): Promise<{ cfg: GspConfig; pc: { clientId: string; clientSecret: string } }> {
    const cfg = await this.resolveConfig();
    if (!cfg) throw new BadRequestException('GSP is not configured. Set the GST Client ID/Secret and account email in the master panel → GST API Config.');
    return this.gstBase(cfg);
  }

  /** Step 1 — request the login OTP to the taxpayer's registered mobile/email. Returns a correlation txn. */
  async gstOtpRequest(gstin: string, gstUsername: string): Promise<{ txn: string; message: string }> {
    const { cfg, pc } = await this.gstCfg();
    const txn = randomUUID().replace(/-/g, '').slice(0, 24);
    const url = `${cfg.baseUrl}/authentication/otprequest?` + this.qs({ email: cfg.email });
    const res = await this.http('GET', url, this.gstHeaders(cfg, pc, { gst_username: gstUsername, state_cd: gstin.slice(0, 2), txn }));
    const bad = this.nicError(res);
    if (bad) throw new BadRequestException(`GST portal: ${bad}`);
    const data = res?.data ?? res;
    return { txn: String(data?.txn ?? res?.txn ?? txn), message: data?.status_desc ?? data?.message ?? 'OTP sent to the registered mobile/email.' };
  }

  /** Step 2 — exchange the login OTP for a session auth token. */
  async gstAuthToken(gstin: string, gstUsername: string, otp: string, txn: string): Promise<{ authToken: string; txn: string }> {
    const { cfg, pc } = await this.gstCfg();
    const url = `${cfg.baseUrl}/authentication/authtoken?` + this.qs({ email: cfg.email, otp });
    const res = await this.http('GET', url, this.gstHeaders(cfg, pc, { gst_username: gstUsername, state_cd: gstin.slice(0, 2), txn }));
    const bad = this.nicError(res);
    if (bad) throw new BadRequestException(`GST portal: ${bad}`);
    const data = res?.data ?? res;
    const authToken = data?.auth_token ?? data?.authtoken ?? data?.['auth-token'] ?? res?.auth_token ?? res?.authtoken;
    if (!authToken) throw new ServiceUnavailableException(`GST portal auth failed (check the OTP / API access): ${data?.status_desc ?? JSON.stringify(res).slice(0, 200)}`);
    return { authToken: String(authToken), txn: String(data?.txn ?? txn) };
  }

  /** Save the generated return JSON to the GST portal (draft on the portal). */
  async gstReturnSave(returnType: 'GSTR1' | 'GSTR3B', gstin: string, gstUsername: string, retPeriod: string, txn: string, authToken: string, payload: unknown): Promise<any> {
    const { cfg, pc } = await this.gstCfg();
    const path = returnType === 'GSTR1' ? '/gstr1/retsave' : '/gstr3b/retsave';
    const url = `${cfg.baseUrl}${path}?` + this.qs({ email: cfg.email });
    const res = await this.http('PUT', url, this.gstHeaders(cfg, pc, {
      gstin, ret_period: retPeriod, gst_username: gstUsername, state_cd: gstin.slice(0, 2), txn, 'auth-token': authToken,
    }), payload);
    const bad = this.nicError(res);
    if (bad) throw new ServiceUnavailableException(`GST portal (save): ${bad}`);
    return res?.data ?? res;
  }

  /** Step 3 — send the EVC OTP used to sign the filing. */
  async gstOtpForEvc(gstin: string, gstUsername: string, txn: string, authToken: string, formType: string): Promise<{ message: string }> {
    const { cfg, pc } = await this.gstCfg();
    const pan = gstin.slice(2, 12);
    const url = `${cfg.baseUrl}/authentication/otpforevc?` + this.qs({ email: cfg.email, gstin, pan, form_type: formType });
    const res = await this.http('GET', url, this.gstHeaders(cfg, pc, {
      gst_username: gstUsername, state_cd: gstin.slice(0, 2), txn, 'auth-token': authToken,
    }));
    const bad = this.nicError(res);
    if (bad) throw new BadRequestException(`GST portal: ${bad}`);
    const data = res?.data ?? res;
    return { message: data?.status_desc ?? data?.message ?? 'EVC OTP sent to the registered mobile.' };
  }

  /** Step 4 — file the return with the EVC OTP. Returns the ARN. */
  async gstReturnFileEvc(returnType: 'GSTR1' | 'GSTR3B', gstin: string, gstUsername: string, retPeriod: string, evcOtp: string, txn: string, authToken: string, filePayload: unknown): Promise<{ arn: string; raw: any }> {
    const { cfg, pc } = await this.gstCfg();
    const pan = gstin.slice(2, 12);
    const path = returnType === 'GSTR1' ? '/gstr1/retevcfile' : '/gstr3b/retevcfile';
    const url = `${cfg.baseUrl}${path}?` + this.qs({ email: cfg.email, pan, evcotp: evcOtp });
    const res = await this.http('POST', url, this.gstHeaders(cfg, pc, {
      gstin, ret_period: retPeriod, gst_username: gstUsername, state_cd: gstin.slice(0, 2), txn, 'auth-token': authToken,
    }), filePayload);
    const data = res?.data ?? res;
    const arn = data?.arn ?? data?.ARN ?? data?.ref_id ?? data?.reference_id;
    if (!arn) throw new ServiceUnavailableException(`Filing was not accepted: ${data?.status_desc ?? JSON.stringify(res).slice(0, 300)}`);
    return { arn: String(arn), raw: data };
  }
}
