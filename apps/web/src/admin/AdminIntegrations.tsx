import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from './adminApi';
import { toast } from '../components/Toaster';

type Cfg = Record<string, any>;

export function AdminIntegrations() {
  const qc = useQueryClient();
  const [smtp, setSmtp] = useState<Cfg>({});
  const [wa, setWa] = useState<Cfg>({});
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [savingWa, setSavingWa] = useState(false);
  const [testing, setTesting] = useState(false);

  const smtpQ = useQuery({ queryKey: ['admin-smtp'], queryFn: async () => (await adminApi.get<Cfg>('/smtp-config')).data });
  const waQ = useQuery({ queryKey: ['admin-wa'], queryFn: async () => (await adminApi.get<Cfg>('/whatsapp-config')).data });
  useEffect(() => { if (smtpQ.data) setSmtp(smtpQ.data); }, [smtpQ.data]);
  useEffect(() => { if (waQ.data) setWa(waQ.data); }, [waQ.data]);

  const setS = (k: string, v: any) => setSmtp((f) => ({ ...f, [k]: v }));
  const setW = (k: string, v: any) => setWa((f) => ({ ...f, [k]: v }));

  async function saveSmtp() {
    setSavingSmtp(true);
    try { await adminApi.put('/smtp-config', smtp); qc.invalidateQueries({ queryKey: ['admin-smtp'] }); toast('Email (SMTP) settings saved'); }
    catch { toast('Save failed', 'error'); } finally { setSavingSmtp(false); }
  }
  async function testSmtp() {
    setTesting(true);
    try {
      const { data } = await adminApi.post('/smtp-config/test', {});
      toast(data.ok ? 'SMTP connection OK ✓' : `SMTP failed: ${data.reason ?? 'unknown'}`, data.ok ? 'success' : 'error');
    } catch (e: any) { toast(e?.response?.data?.message ?? 'Test failed', 'error'); }
    finally { setTesting(false); }
  }
  async function saveWa() {
    setSavingWa(true);
    try { await adminApi.put('/whatsapp-config', wa); qc.invalidateQueries({ queryKey: ['admin-wa'] }); toast('WhatsApp settings saved'); }
    catch { toast('Save failed', 'error'); } finally { setSavingWa(false); }
  }

  return (
    <section className="page">
      <div className="page-head"><h2>Integrations</h2></div>

      {/* ── Email / SMTP ── */}
      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Email (SMTP)</h3>
          <div className="card-actions">
            <button className="btn-ghost" disabled={testing} onClick={testSmtp}>{testing ? 'Testing…' : 'Test Email'}</button>
            <button className="btn-primary" disabled={savingSmtp} onClick={saveSmtp}>{savingSmtp ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>
          Used to send password-reset links and invoice/receipt emails. Any transactional SMTP provider works
          (Brevo, SendGrid, Amazon SES, Gmail app password, etc.).
        </p>
        <div className="form-grid form-grid--2">
          <label>SMTP Host<input value={smtp.host ?? ''} onChange={(e) => setS('host', e.target.value)} placeholder="smtp.provider.com" /></label>
          <label>Port<input type="number" value={smtp.port ?? 587} onChange={(e) => setS('port', Number(e.target.value))} placeholder="587" /></label>
          <label>Username<input value={smtp.user ?? ''} onChange={(e) => setS('user', e.target.value)} placeholder="apikey / login" autoComplete="off" /></label>
          <label>Password<input type="password" value={smtp.pass ?? ''} onChange={(e) => setS('pass', e.target.value)} placeholder={smtp.passSet ? 'unchanged — leave to keep' : ''} autoComplete="new-password" /></label>
          <label>From Address<input value={smtp.from ?? ''} onChange={(e) => setS('from', e.target.value)} placeholder="no-reply@donicy.in" /></label>
          <label className="checkbox" style={{ alignSelf: 'end' }}>
            <input type="checkbox" checked={!!smtp.secure} onChange={(e) => setS('secure', e.target.checked)} /> Use TLS/SSL (port 465)
          </label>
        </div>
      </div>

      {/* ── WhatsApp (Twilio) ── */}
      <div className="card">
        <div className="card-head">
          <h3 className="card-title">WhatsApp (Twilio)</h3>
          <button className="btn-primary" disabled={savingWa} onClick={saveWa}>{savingWa ? 'Saving…' : 'Save'}</button>
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>
          Optional. Sends invoices over WhatsApp via the Twilio WhatsApp Business API. Without it, the app still
          produces a wa.me share link. Requires <b>APP_PUBLIC_URL</b> set so WhatsApp can fetch the PDF.
        </p>
        <div className="form-grid form-grid--2">
          <label>Account SID<input value={wa.accountSid ?? ''} onChange={(e) => setW('accountSid', e.target.value)} placeholder="ACxxxxxxxx" autoComplete="off" /></label>
          <label>Auth Token<input type="password" value={wa.authToken ?? ''} onChange={(e) => setW('authToken', e.target.value)} placeholder={wa.authTokenSet ? 'unchanged — leave to keep' : ''} autoComplete="new-password" /></label>
          <label className="span2">WhatsApp From<input value={wa.from ?? ''} onChange={(e) => setW('from', e.target.value)} placeholder="whatsapp:+14155238886" /></label>
        </div>
      </div>

      <p className="muted small">
        Object storage (S3 / Vercel Blob) and the payment gateway are configured via environment variables for now.
      </p>
    </section>
  );
}
