import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/** Sends invoice emails via SMTP if configured; otherwise reports not-configured. */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  constructor(private readonly config: ConfigService) {}

  private transport() {
    const host = this.config.get<string>('SMTP_HOST');
    if (!host) return null;
    return nodemailer.createTransport({
      host,
      port: Number(this.config.get('SMTP_PORT', 587)),
      auth: { user: this.config.get('SMTP_USER'), pass: this.config.get('SMTP_PASS') },
    });
  }

  /** Verify the SMTP connection/credentials (used by Settings → "Test email connection"). */
  async verify(): Promise<{ ok: boolean; reason?: string; host?: string }> {
    const t = this.transport();
    const host = this.config.get<string>('SMTP_HOST');
    if (!t) return { ok: false, reason: 'SMTP not configured (set SMTP_HOST / SMTP_USER / SMTP_PASS in .env)' };
    try {
      await t.verify();
      return { ok: true, host };
    } catch (e: any) {
      return { ok: false, reason: e?.message ?? 'SMTP verification failed', host };
    }
  }

  async sendInvoice(to: string, filename: string, pdf: Buffer, subject: string): Promise<{ sent: boolean; reason?: string }> {
    const t = this.transport();
    if (!t) {
      this.logger.warn('SMTP not configured — skipping email send');
      return { sent: false, reason: 'SMTP not configured (set SMTP_HOST/USER/PASS in .env)' };
    }
    await t.sendMail({
      from: this.config.get('SMTP_USER'),
      to, subject,
      text: 'Please find your invoice attached.',
      attachments: [{ filename, content: pdf }],
    });
    return { sent: true };
  }

  isConfigured(): boolean {
    return !!this.config.get<string>('SMTP_HOST');
  }

  /** Sends a password-reset email with the one-time link. */
  async sendPasswordReset(to: string, resetUrl: string): Promise<{ sent: boolean; reason?: string }> {
    const t = this.transport();
    if (!t) {
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
    await t.sendMail({
      from: this.config.get('SMTP_USER'),
      to,
      subject: 'Reset your DONICY password',
      text: `Reset your DONICY password using this link (valid for 1 hour): ${resetUrl}`,
      html,
    });
    return { sent: true };
  }
}
