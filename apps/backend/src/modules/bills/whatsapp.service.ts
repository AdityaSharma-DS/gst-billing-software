import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * WhatsApp invoice delivery.
 * - Always returns a wa.me share link (works with zero configuration).
 * - When Twilio is configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
 *   TWILIO_WHATSAPP_FROM), also sends via the WhatsApp Business API with the
 *   archived invoice PDF attached (APP_PUBLIC_URL must be publicly reachable
 *   for WhatsApp to fetch the media).
 * Free-form messages deliver only within 24h of the customer's last inbound
 * message; outside that window use an approved Content Template (CONTENT_SID).
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  constructor(private readonly config: ConfigService) {}

  /** Normalize an Indian phone number to E.164 (+91…). */
  private e164(phone?: string | null): string | null {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return `+91${digits}`;
    if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
    if (phone.trim().startsWith('+')) return phone.trim();
    return null;
  }

  buildMessage(bill: any, org: any): string {
    const inr = (n: any) => '₹' + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const lines = [
      `Dear ${bill.party?.name ?? 'Customer'},`,
      ``,
      `Your ${bill.invoiceType === 'PROFORMA' ? 'proforma invoice' : 'invoice'} *${bill.billNumber}* dated ${new Date(bill.billDate).toLocaleDateString('en-IN')} for *${inr(bill.grandTotal)}* is ready.`,
    ];
    if (bill.dueDate) lines.push(`Payment due by ${new Date(bill.dueDate).toLocaleDateString('en-IN')}.`);
    if (org?.upiId) lines.push(`Pay via UPI: ${org.upiId}`);
    lines.push(``, `Thank you,`, `${org?.tradeName ?? org?.legalName ?? 'DONICY'}`);
    return lines.join('\n');
  }

  /** Send the invoice over WhatsApp. Returns the share link and (if configured) API delivery info. */
  async send(bill: any, org: any, pdfUrl: string, toOverride?: string) {
    const to = this.e164(toOverride || bill.party?.phone);
    const message = this.buildMessage(bill, org);
    const waLink = `https://wa.me/${to ? to.replace('+', '') : ''}?text=${encodeURIComponent(message)}`;

    const sid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const token = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const from = this.config.get<string>('TWILIO_WHATSAPP_FROM'); // e.g. whatsapp:+14155238886

    if (!sid || !token || !from) {
      return { apiSent: false, reason: 'WhatsApp API not configured (set TWILIO_* in .env) — use the share link', waLink, to };
    }
    if (!to) return { apiSent: false, reason: 'Client has no valid phone number', waLink, to };

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const twilio = require('twilio');
      const client = twilio(sid, token);
      const publicBase = this.config.get<string>('APP_PUBLIC_URL'); // must be reachable by WhatsApp
      const mediaUrl = publicBase && pdfUrl?.startsWith('/uploads/') ? [`${publicBase}${pdfUrl}`] : undefined;
      const msg = await client.messages.create({
        from,
        to: `whatsapp:${to}`,
        body: message,
        ...(mediaUrl ? { mediaUrl } : {}),
      });
      return { apiSent: true, sid: msg.sid, status: msg.status, waLink, to };
    } catch (e: any) {
      this.logger.warn(`Twilio WhatsApp send failed: ${e?.message}`);
      return { apiSent: false, reason: e?.message ?? 'Twilio send failed', waLink, to };
    }
  }
}
