import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from './adminApi';
import { toast } from '../components/Toaster';

type Cfg = Record<string, string>;

export function AdminGstConfig() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Cfg>({});
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({ queryKey: ['admin-gst-config'], queryFn: async () => (await adminApi.get<Cfg>('/gst-config')).data });
  useEffect(() => { if (data) setForm(data); }, [data]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      await adminApi.put('/gst-config', form);
      qc.invalidateQueries({ queryKey: ['admin-gst-config'] });
      toast('GST API configuration saved');
    } catch { toast('Save failed', 'error'); }
    finally { setSaving(false); }
  }

  return (
    <section className="page">
      <div className="page-head">
        <h2>GST API Configuration</h2>
        <button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save Configuration'}</button>
      </div>

      <div className="card">
        <h3 className="card-title">GSP Account — WhiteBooks</h3>
        <p className="muted small" style={{ marginTop: 0 }}>
          WhiteBooks (developer.whitebooks.in) is the GST Suvidha Provider. One Client ID/Secret pair covers
          e-Invoice, e-Way Bill, GSTR filing, GSTR-2B and Payment APIs. The GSP wraps NIC's encryption, so the
          app sends plain JSON. Each taxpayer's own NIC username/password is entered per-organisation under
          Settings → GST APIs.
        </p>
        <div className="seg-row" style={{ marginTop: 4 }}>
          {['sandbox', 'production'].map((env) => (
            <button key={env} className={`seg ${form.environment === env ? 'seg--active' : ''}`} onClick={() => set('environment', env)}>{env[0].toUpperCase() + env.slice(1)}</button>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          Token TTL: 1 hour (sandbox) / 6 hours (production). Use the <b>sandbox</b> credentials (Client ID starts
          with <code>GSTS…</code>) for testing against the NIC sandbox GSTINs; switch to <b>production</b>
          (<code>GSTP…</code>) only when going live.
        </p>
      </div>

      <div className="card">
        <h3 className="card-title">Credentials</h3>
        <div className="form-grid form-grid--2">
          <label className="span2">API Base URL
            <input value={form.baseUrl ?? ''} onChange={(e) => set('baseUrl', e.target.value)} placeholder="https://api.whitebooks.in" />
          </label>
          <label>Account Email
            <input value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} placeholder="WhiteBooks account email" />
          </label>
          <label>Whitelisted IP Address
            <input value={form.ipAddress ?? ''} onChange={(e) => set('ipAddress', e.target.value)} placeholder="public IP registered with NIC" />
          </label>
          <label>Client ID
            <input value={form.clientId ?? ''} onChange={(e) => set('clientId', e.target.value)} placeholder="GSTS… (sandbox) / GSTP… (production)" />
          </label>
          <label>Client Secret
            <input type="password" value={form.clientSecret ?? ''} onChange={(e) => set('clientSecret', e.target.value)} placeholder={form.clientSecretSet ? 'unchanged — leave to keep' : ''} />
          </label>
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          The client secret is stored server-side and never sent back to this screen. Leave it as the masked
          value to keep the saved secret.
        </p>
      </div>

      <div className="card">
        <h3 className="card-title">Tax Rates (optional)</h3>
        <div className="form-grid form-grid--2">
          <label>FastGST URL<input value={form.fastGstUrl ?? ''} onChange={(e) => set('fastGstUrl', e.target.value)} /></label>
          <label>FastGST API Key<input type="password" value={form.fastGstApiKey ?? ''} onChange={(e) => set('fastGstApiKey', e.target.value)} /></label>
        </div>
      </div>
    </section>
  );
}
