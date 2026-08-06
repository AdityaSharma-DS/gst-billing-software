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
        <h3 className="card-title">Environment</h3>
        <div className="seg-row">
          {['sandbox', 'production'].map((env) => (
            <button key={env} className={`seg ${form.environment === env ? 'seg--active' : ''}`} onClick={() => set('environment', env)}>{env[0].toUpperCase() + env.slice(1)}</button>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>Token TTL: 1 hour on sandbox, 6 hours on production (NIC). Credentials here are used by the e-Invoice, e-Way Bill and GSTR filing integrations.</p>
      </div>

      <div className="card">
        <h3 className="card-title">e-Invoice (IRP / NIC)</h3>
        <div className="form-grid form-grid--2">
          <label className="span2">Base URL<input value={form.einvoiceBaseUrl ?? ''} onChange={(e) => set('einvoiceBaseUrl', e.target.value)} placeholder="https://einv-apisandbox.nic.in" /></label>
          <label>Client ID<input value={form.einvoiceClientId ?? ''} onChange={(e) => set('einvoiceClientId', e.target.value)} /></label>
          <label>Client Secret<input type="password" value={form.einvoiceClientSecret ?? ''} onChange={(e) => set('einvoiceClientSecret', e.target.value)} /></label>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">e-Way Bill</h3>
        <div className="form-grid form-grid--2">
          <label className="span2">Base URL<input value={form.ewaybillBaseUrl ?? ''} onChange={(e) => set('ewaybillBaseUrl', e.target.value)} /></label>
          <label>Client ID<input value={form.ewaybillClientId ?? ''} onChange={(e) => set('ewaybillClientId', e.target.value)} /></label>
          <label>Client Secret<input type="password" value={form.ewaybillClientSecret ?? ''} onChange={(e) => set('ewaybillClientSecret', e.target.value)} /></label>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">GSTN (returns filing) &amp; Tax Rates</h3>
        <div className="form-grid form-grid--2">
          <label>GSTN Base URL<input value={form.gstnBaseUrl ?? ''} onChange={(e) => set('gstnBaseUrl', e.target.value)} /></label>
          <label>GSTN API Key<input type="password" value={form.gstnApiKey ?? ''} onChange={(e) => set('gstnApiKey', e.target.value)} /></label>
          <label>FastGST URL (tax rates)<input value={form.fastGstUrl ?? ''} onChange={(e) => set('fastGstUrl', e.target.value)} /></label>
          <label>FastGST API Key<input type="password" value={form.fastGstApiKey ?? ''} onChange={(e) => set('fastGstApiKey', e.target.value)} /></label>
        </div>
      </div>
    </section>
  );
}
