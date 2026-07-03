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
}
