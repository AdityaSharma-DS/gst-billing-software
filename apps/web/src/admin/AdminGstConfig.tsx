import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from './adminApi';
import { toast } from '../components/Toaster';

type Cfg = Record<string, any>;

const BASE_URL: Record<string, string> = {
  sandbox: 'https://apisandbox.whitebooks.in',
  production: 'https://api.whitebooks.in',
};

// WhiteBooks issues a separate Client ID/Secret per product.
const PRODUCTS: { key: string; title: string; idHint: string }[] = [
  { key: 'gst', title: 'GST APIs (returns, GSTR-2B)', idHint: 'GSTS… (sandbox) / GSTP… (production)' },
  { key: 'einvoice', title: 'e-Invoice (IRN)', idHint: 'EINS… (sandbox) / EINP… (production)' },
  { key: 'ewaybill', title: 'e-Way Bill', idHint: 'EWBS… (sandbox) / EWBP… (production)' },
];

export function AdminGstConfig() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Cfg>({});
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({ queryKey: ['admin-gst-config'], queryFn: async () => (await adminApi.get<Cfg>('/gst-config')).data });
  useEffect(() => { if (data) setForm(data); }, [data]);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const env = form.environment ?? 'sandbox';

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
          WhiteBooks (developer.whitebooks.in) is the GST Suvidha Provider. It issues a <b>separate Client ID &amp;
          Secret per product</b> (GST, e-Invoice, e-Way Bill), each with sandbox &amp; production keys. Enter the pairs
          below. Each taxpayer's own NIC username/password/GSTIN is set per-organisation under Settings → GST APIs.
        </p>
        <div className="seg-row" style={{ marginTop: 4 }}>
          {['sandbox', 'production'].map((e) => (
            <button key={e} className={`seg ${env === e ? 'seg--active' : ''}`} onClick={() => set('environment', e)}>{e[0].toUpperCase() + e.slice(1)}</button>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          Base URL for <b>{env}</b>: <code>{BASE_URL[env]}</code> (auto). Sandbox uses default OTP <code>575757</code> and the
          test GSTINs provided by WhiteBooks. Token TTL is ~1h (sandbox) / ~6h (production).
        </p>
        <div className="form-grid form-grid--2" style={{ marginTop: 8 }}>
          <label>Account Email
            <input value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} placeholder="WhiteBooks account email" />
          </label>
          <label>Whitelisted IP Address
            <input value={form.ipAddress ?? ''} onChange={(e) => set('ipAddress', e.target.value)} placeholder="public IP registered with NIC" />
          </label>
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          ⚠️ NIC requires calls from a whitelisted <b>static IP</b>. Serverless (Vercel) egress IPs are dynamic — route
          GSP calls through a fixed-IP host if production calls fail.
        </p>
      </div>

      {PRODUCTS.map((p) => {
        const idKey = `${p.key}ClientId`;
        const secKey = `${p.key}ClientSecret`;
        return (
          <div className="card" key={p.key}>
            <h3 className="card-title">{p.title}</h3>
            <div className="form-grid form-grid--2">
              <label>Client ID
                <input value={form[idKey] ?? ''} onChange={(e) => set(idKey, e.target.value)} placeholder={p.idHint} autoComplete="off" />
              </label>
              <label>Client Secret
                <input type="password" value={form[secKey] ?? ''} onChange={(e) => set(secKey, e.target.value)}
                  placeholder={form[`${secKey}Set`] ? 'unchanged — leave to keep' : ''} autoComplete="new-password" />
              </label>
            </div>
          </div>
        );
      })}

      {env === 'sandbox' && (
        <div className="card">
          <h3 className="card-title">Sandbox Test Taxpayer</h3>
          <p className="muted small" style={{ marginTop: 0 }}>
            Sandbox only authenticates WhiteBooks' <b>test GSTINs</b>, not real ones. Enter the <b>Username, Password
            and test GSTIN</b> from your WhiteBooks <b>Credentials</b> page (e-Way Bill / e-Invoice). This is used as the
            NIC login for <b>all</b> tenants while testing — no per-business setup needed. Ignored in production.
          </p>
          <div className="form-grid form-grid--2">
            <label>Test GSTIN
              <input value={form.sandboxGstin ?? ''} onChange={(e) => set('sandboxGstin', e.target.value.toUpperCase())} placeholder="e.g. 36AAGCB1286Q004" autoComplete="off" />
            </label>
            <label>Username
              <input value={form.sandboxUsername ?? ''} onChange={(e) => set('sandboxUsername', e.target.value)} placeholder="from your Credentials page" autoComplete="off" />
            </label>
            <label>Password
              <input type="password" value={form.sandboxPassword ?? ''} onChange={(e) => set('sandboxPassword', e.target.value)}
                placeholder={form.sandboxPasswordSet ? 'unchanged — leave to keep' : ''} autoComplete="new-password" />
            </label>
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="card-title">Tax Rates (optional)</h3>
        <div className="form-grid form-grid--2">
          <label>FastGST URL<input value={form.fastGstUrl ?? ''} onChange={(e) => set('fastGstUrl', e.target.value)} /></label>
          <label>FastGST API Key<input type="password" value={form.fastGstApiKey ?? ''} onChange={(e) => set('fastGstApiKey', e.target.value)}
            placeholder={form.fastGstApiKeySet ? 'unchanged — leave to keep' : ''} /></label>
        </div>
      </div>

      <p className="muted small">Secrets are stored encrypted server-side and never sent back to this screen — leave a masked field to keep the saved value.</p>
    </section>
  );
}
