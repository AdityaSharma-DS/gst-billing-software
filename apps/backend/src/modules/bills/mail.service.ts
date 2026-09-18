import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../common/prisma/prisma.service';
import { decryptSecret } from '../../common/crypto/secret.util';

interface SmtpConfig { host: string; port: number; secure: boolean; user: string; pass: string; from: string; }

/**
 * Sends emails via SMTP. Configuration comes from the master panel first
 * (platform_settings → smtp_config, secret encrypted at rest), then falls back
 * to SMTP_* environment variables. Reports not-configured when neither is set.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {}

  /** Resolve SMTP settings: DB (master panel) first, then env. */
  private async loadConfig(): Promise<SmtpConfig | null> {
    try {
      const row = await this.prisma.admin.platformSetting.findUnique({ where: { key: 'smtp_config' } });
      const c: any = (row?.value as any) ?? {};
      if (c.host) {
        return { host: c.host, port: Number(c.port) || 587, secure: !!c.secure, user: c.user ?? '', pass: decryptSecret(c.pass), from: c.from || c.user || '' };
      }
    } catch (e: any) {
      this.logger.warn(`Could not read SMTP config from DB: ${e?.message}`);
    }
    const host = this.config.get<string>('SMTP_HOST');
    if (!host) return null;
    const user = this.config.get<string>('SMTP_USER') ?? '';
    return { host, port: Number(this.config.get('SMTP_PORT', 587)), secure: false, user, pass: this.config.get<string>('SMTP_PASS') ?? '', from: user };
  }

  private async transport(): Promise<{ t: nodemailer.Transporter; from: string } | null> {
    const cfg = await this.loadConfig();
    if (!cfg) return null;
    return {
      t: nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.secure, auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined }),
      from: cfg.from || cfg.user,
    };
  }

  /** Verify the SMTP connection/credentials (Settings / master panel "Test email"). */
  async verify(): Promise<{ ok: boolean; reason?: string; host?: string }> {
    const tr = await this.transport();
    if (!tr) return { ok: false, reason: 'SMTP not configured (set it in the master panel → Integrations, or SMTP_* env vars)' };
    try {
      await tr.t.verify();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, reason: e?.message ?? 'SMTP verification failed' };
    }
  }

  async sendInvoice(to: string, filename: string, pdf: Buffer, subject: string): Promise<{ sent: boolean; reason?: string }> {
    const tr = await this.transport();
    if (!tr) {
      this.logger.warn('SMTP not configured — skipping email send');
      return { sent: false, reason: 'SMTP not configured' };
    }
    await tr.t.sendMail({
      from: tr.from,
      to, subject,
      text: 'Please find your invoice attached.',
      attachments: [{ filename, content: pdf }],
    });
    return { sent: true };
  }

  async isConfigured(): Promise<boolean> {
    return !!(await this.loadConfig());
  }

  /** Sends a password-reset email with the one-time link. */
  async sendPasswordReset(to: string, resetUrl: string): Promise<{ sent: boolean; reason?: string }> {
    const tr = await this.transport();
    if (!tr) {
      this.logger.warn('SMTP not configured — password reset email not sent');
      return { sent: false, reason: 'SMTP not configured' };
    }
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
        <h2 style="color:#F68820;margin-bottom:8px">Reset your DONICY password</h2>
        <p>We received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.</p>
        <p style="margin:24px 0">
          <a href="${resetUrl}" style="background:#F68820;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Reset password</a>
        </p>
        <p style="color:#667085;font-size:13px">If you didn't request this, you can safely ignore this email — your password won't change.</p>
        <p style="color:#98A2B3;font-size:12px;word-break:break-all">Or paste this link into your browser:<br>${resetUrl}</p>
      </div>`;
    await tr.t.sendMail({
      from: tr.from,
      to,
      subject: 'Reset your DONICY password',
      text: `Reset your DONICY password using this link (valid for 1 hour): ${resetUrl}`,
      html,
    });
    return { sent: true };
  }
}
