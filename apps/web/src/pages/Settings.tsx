import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, currentRole } from '../lib/api';
import { Modal } from '../components/Modal';
import { StateSelect } from '../components/StateSelect';
import { stateName } from '../lib/states';
import { useBarcodeScanner } from '../components/useBarcodeScanner';
import { getScannerPrefs, setScannerPrefs, ScannerPrefs } from '../lib/scanner';
import { toast } from '../components/Toaster';
import { ACCENTS, Accent, Theme, getTheme, getAccent, getContrast, setTheme, setAccent, setContrast } from '../lib/theme';

interface TeamUser { id: string; email: string; fullName: string; role: 'ADMIN' | 'ACCOUNTANT' | 'VIEWER'; isActive: boolean; lastLoginAt?: string | null; }

const ROLE_INFO: Record<string, string> = {
  ADMIN: 'Full access — settings, users, billing',
  ACCOUNTANT: 'Create & edit bills, clients, payments',
  VIEWER: 'Read-only access to all data',
};

function BarcodeSection() {
  const [prefs, setPrefs] = useState<ScannerPrefs>(getScannerPrefs());
  const [testing, setTesting] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);

  const update = (patch: Partial<ScannerPrefs>) => { const next = { ...prefs, ...patch }; setPrefs(next); setScannerPrefs(next); };

  // Live "test scanner": capture the next scan while the test box is active.
  useBarcodeScanner((code) => { setLastScan(code); setTesting(false); toast(`Scanner detected: ${code}`); },
    { enabled: testing, suffix: prefs.suffix, minLength: prefs.minLength });

  return (
    <div className="card">
      <h3 className="card-title">Barcode Device Integration</h3>
      <p className="muted small" style={{ marginTop: 0 }}>
        Most USB &amp; Bluetooth barcode scanners work as keyboard (HID) devices — plug in / pair, then scan.
        With capture enabled, scanning anywhere on the New Invoice / Purchase page adds the item automatically.
      </p>
      <div className="form-grid form-grid--2">
        <label className="checkbox"><input type="checkbox" checked={prefs.enabled} onChange={(e) => update({ enabled: e.target.checked })} /> Enable hardware scanner capture</label>
        <label>Scanner suffix (terminator)
          <select value={prefs.suffix} onChange={(e) => update({ suffix: e.target.value as ScannerPrefs['suffix'] })}>
            <option value="Enter">Enter (default)</option>
            <option value="Tab">Tab</option>
          </select>
        </label>
        <label>Minimum barcode length<input type="number" min={2} value={prefs.minLength} onChange={(e) => update({ minLength: Math.max(2, +e.target.value) })} /></label>
      </div>

      <div className="scanner-test">
        <button className={`btn-${testing ? 'primary' : 'ghost'}`} onClick={() => { setLastScan(null); setTesting((t) => !t); }}>
          {testing ? 'Listening… scan now' : 'Test Scanner'}
        </button>
        {testing && <span className="muted small">Aim your scanner at a barcode and scan. (Don't click into a field.)</span>}
        {lastScan && <span className="pos small">✓ Device detected — last scan: <b className="mono">{lastScan}</b></span>}
      </div>
      <p className="muted small">Tip: configure your scanner to append a carriage return (Enter) after each code — that's the factory default for most models.</p>
    </div>
  );
}

function UsersSection() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', password: '', role: 'ACCOUNTANT' as TeamUser['role'] });
  const [formErr, setFormErr] = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['team-users'],
    queryFn: async () => (await api.get<TeamUser[]>('/users')).data,
  });

  const create = useMutation({
    mutationFn: async () => (await api.post('/users', form)).data,
    onSuccess: (u: TeamUser) => {
      qc.invalidateQueries({ queryKey: ['team-users'] });
      toast(`${u.fullName} added as ${u.role.toLowerCase()}`);
      setOpen(false); setForm({ fullName: '', email: '', password: '', role: 'ACCOUNTANT' });
    },
    onError: (e: any) => setFormErr(e?.response?.data?.message ?? 'Could not add user'),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<TeamUser> & { password?: string } }) =>
      (await api.patch(`/users/${id}`, patch)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['team-users'] }); toast('User updated'); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Update failed', 'error'),
  });

  return (
    <div className="card">
      <div className="card-head">
        <h3 className="card-title">Users &amp; Roles</h3>
        <button className="btn-primary" onClick={() => { setFormErr(''); setOpen(true); }}>+ Add User</button>
      </div>
      <table className="data-table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
        <tbody>
          {isLoading && <tr><td colSpan={6} className="muted">Loading…</td></tr>}
          {users.map((u) => (
            <tr key={u.id}>
              <td className="cell-strong">{u.fullName}</td>
              <td className="muted">{u.email}</td>
              <td>
                <select
                  className="status-select role-select"
                  value={u.role}
                  onChange={(e) => update.mutate({ id: u.id, patch: { role: e.target.value as TeamUser['role'] } })}
                  title={ROLE_INFO[u.role]}
                >
                  {(['ADMIN', 'ACCOUNTANT', 'VIEWER'] as const).map((r) => <option key={r} value={r}>{r[0] + r.slice(1).toLowerCase()}</option>)}
                </select>
              </td>
              <td>{u.isActive ? <span className="badge badge--finalized">Active</span> : <span className="badge badge--cancelled">Disabled</span>}</td>
              <td className="muted">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('en-IN') : 'Never'}</td>
              <td className="actions">
                <button className={`link-btn ${u.isActive ? 'danger' : ''}`} onClick={() => update.mutate({ id: u.id, patch: { isActive: !u.isActive } })}>
                  {u.isActive ? 'Disable' : 'Enable'}
                </button>
                <button className="link-btn" onClick={() => {
                  const pw = prompt(`New password for ${u.fullName} (min 6 chars):`);
                  if (pw) update.mutate({ id: u.id, patch: { password: pw } });
                }}>Reset Password</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small" style={{ marginTop: 8 }}>
        <b>Admin</b>: {ROLE_INFO.ADMIN} · <b>Accountant</b>: {ROLE_INFO.ACCOUNTANT} · <b>Viewer</b>: {ROLE_INFO.VIEWER}
      </p>

      {open && (
        <Modal
          title="Add User"
          onClose={() => setOpen(false)}
          footer={<>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={!form.fullName || !form.email || form.password.length < 6 || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? 'Adding…' : 'Add User'}
            </button>
          </>}
        >
          <div className="form-grid">
            <label>Full Name *<input autoFocus value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></label>
            <label>Email *<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label>Password * (min 6)<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
            <label>Role
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as TeamUser['role'] })}>
                <option value="ADMIN">Admin</option>
                <option value="ACCOUNTANT">Accountant</option>
                <option value="VIEWER">Viewer</option>
              </select>
            </label>
          </div>
          <p className="muted small">{ROLE_INFO[form.role]}</p>
          {formErr && <p className="error">{formErr}</p>}
        </Modal>
      )}
    </div>
  );
}

const TAX_REGIMES = [
  { id: 'REGULAR', label: 'Regular' },
  { id: 'COMPOSITION', label: 'Composition' },
  { id: 'UNREGISTERED', label: 'Unregistered' },
];
const FIN_YEARS = ['2024-25', '2025-26', '2026-27', '2027-28', '2028-29'];

type Org = Record<string, any>;

const SETTINGS_TABS = ['Theme', 'Company Details', 'Terms & Conditions', 'Notifications', 'General', 'App Update'] as const;
type SettingsTab = typeof SETTINGS_TABS[number];

/** Appearance controls — theme, accent colour, contrast (per-browser). */
function ThemeSection() {
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const [accent, setAccentState] = useState<Accent>(getAccent());
  const [contrast, setContrastState] = useState(getContrast());
  return (
    <div className="card">
      <h4 className="section-label">Pre-prepared colours</h4>
      <div className="swatch-row">
        {ACCENTS.map((a) => (
          <button
            key={a.id}
            className={`swatch ${accent === a.id ? 'swatch--active' : ''}`}
            style={{ background: a.swatch }}
            title={a.label}
            aria-label={a.label}
            onClick={() => { setAccent(a.id); setAccentState(a.id); }}
          />
        ))}
      </div>

      <h4 className="section-label">Theme</h4>
      <div className="form-grid form-grid--2">
        <label>Appearance
          <select value={theme} onChange={(e) => { const t = e.target.value as Theme; setTheme(t); setThemeState(t); }}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </div>

      <label className="checkbox toggle-row" style={{ marginTop: 16 }}>
        <input type="checkbox" checked={contrast} onChange={(e) => { setContrast(e.target.checked); setContrastState(e.target.checked); }} />
        <span><b>Enhance contrast</b><br /><span className="muted small">When enabled, contrast between text/controls and their backgrounds is increased.</span></span>
      </label>
      <p className="muted small" style={{ marginTop: 12 }}>Theme &amp; colour are saved to this browser and apply instantly.</p>
    </div>
  );
}

export function Settings() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Org>({});
  const [saved, setSaved] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<SettingsTab>('Company Details');

  const { data: org } = useQuery({ queryKey: ['organization'], queryFn: async () => (await api.get<Org>('/organization')).data });
  useEffect(() => { if (org) setForm(org); }, [org]);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true); setSaved('');
    try {
      const payload = { ...form, state: form.stateCode ? stateName(form.stateCode) : form.state };
      await api.patch('/organization', payload);
      qc.invalidateQueries({ queryKey: ['organization'] });
      setSaved('Saved');
      setTimeout(() => setSaved(''), 2500);
    } finally { setSaving(false); }
  }

  async function verifySmtp() {
    try {
      const { data } = await api.post('/organization/verify-smtp', {});
      toast(data.ok ? `SMTP OK (${data.host})` : data.reason ?? 'SMTP check failed', data.ok ? 'success' : 'error');
    } catch { toast('SMTP check failed', 'error'); }
  }

  const [gspTesting, setGspTesting] = useState(false);
  async function verifyGsp() {
    setGspTesting(true);
    try {
      const { data } = await api.post('/organization/verify-gsp', {});
      toast(data.ok ? data.message : 'GSP check failed', data.ok ? 'success' : 'error');
    } catch (e: any) {
      toast(e?.response?.data?.message ?? 'GSP authentication failed', 'error');
    } finally { setGspTesting(false); }
  }

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const { data } = await api.post('/organization/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      set('logoUrl', data.logoUrl);
      qc.invalidateQueries({ queryKey: ['organization'] });
    } finally { setUploading(false); }
  }

  const showSave = tab === 'Company Details' || tab === 'Terms & Conditions';

  return (
    <section className="page">
      <div className="page-head">
        <h2>Settings</h2>
        <div className="page-actions">
          {saved && <span className="pos small">{saved}</span>}
          {showSave && <button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save Changes'}</button>}
        </div>
      </div>

      <div className="tabs">
        {SETTINGS_TABS.map((t) => (
          (t !== 'General' || currentRole() === 'ADMIN')
            ? <button key={t} className={`tab ${tab === t ? 'tab--active' : ''}`} onClick={() => setTab(t)}>{t}</button>
            : null
        ))}
      </div>

      {tab === 'Theme' && <ThemeSection />}

      {tab === 'App Update' && (
        <div className="card" style={{ maxWidth: 520 }}>
          <h3 className="card-title">App Update</h3>
          <div className="kv-row"><span className="muted">Version</span><b>DONICY 1.0.0</b></div>
          <div className="kv-row"><span className="muted">Channel</span><b>Stable</b></div>
          <div className="kv-row"><span className="muted">Status</span><span className="badge badge--finalized">Up to date</span></div>
          <p className="muted small" style={{ marginTop: 12 }}>You're on the latest version. Updates are rolled out automatically by the DONICY team.</p>
        </div>
      )}

      {tab === 'Notifications' && (
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Email (SMTP)</h3>
            <button className="btn-ghost" onClick={verifySmtp}>Test Email (SMTP)</button>
          </div>
          <p className="muted small" style={{ marginTop: 0 }}>
            Invoices and receipts are emailed via the SMTP server configured in your deployment. Use <b>Test Email</b>
            to verify the connection. GST due-date and approval reminders are sent from here once enabled.
          </p>
        </div>
      )}

      {tab === 'General' && currentRole() === 'ADMIN' && (
        <>
          <BarcodeSection />
          <UsersSection />
        </>
      )}

      {/* ── Company Details tab ── */}
      {tab === 'Company Details' && <>
      <div className="card">
        <h3 className="card-title">Company Branding</h3>
        <div className="brand-row">
          <div className="logo-box">
            {form.logoUrl ? <img src={form.logoUrl} alt="logo" /> : <span className="muted small">No logo</span>}
          </div>
          <div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={uploadLogo} />
            <button className="btn-ghost" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Uploading…' : 'Upload Logo'}</button>
            <p className="muted small">PNG/JPG, up to 2 MB. Appears on your invoices.</p>
          </div>
        </div>
        <div className="form-grid form-grid--2">
          <label>Display Name (Trade Name)<input value={form.tradeName ?? ''} onChange={(e) => set('tradeName', e.target.value)} /></label>
          <label>Legal / Registered Name<input value={form.legalName ?? ''} onChange={(e) => set('legalName', e.target.value)} /></label>
          <label>Invoice Short Code (3 letters)
            <input maxLength={3} value={form.invoiceShortCode ?? ''} onChange={(e) => set('invoiceShortCode', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="DON" />
          </label>
          <label className="span2 muted small" style={{ alignSelf: 'end' }}>
            Invoices are archived as <b>{(form.invoiceShortCode || 'DON')}/26-27/June/15/INV-00001.pdf</b>
          </label>
        </div>
      </div>

      {/* Registration & address */}
      <div className="card">
        <h3 className="card-title">Registered Address</h3>
        <div className="form-grid form-grid--2">
          <label className="span2">Address<input value={form.addressLine1 ?? ''} onChange={(e) => set('addressLine1', e.target.value)} /></label>
          <label>City<input value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} /></label>
          <label>Pincode<input value={form.pincode ?? ''} onChange={(e) => set('pincode', e.target.value)} /></label>
          <StateSelect value={form.stateCode ?? ''} onChange={(c) => set('stateCode', c)} label="Home State" />
          <label>Email<input value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} /></label>
          <label>Phone<input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></label>
        </div>
      </div>

      {/* GST & Tax */}
      <div className="card">
        <h3 className="card-title">GST &amp; Tax</h3>
        <div className="form-grid form-grid--2">
          <label>GSTIN<input value={form.gstin ?? ''} onChange={(e) => set('gstin', e.target.value)} placeholder="27AABCD1234E1Z5" /></label>
          <label>PAN<input value={form.pan ?? ''} onChange={(e) => set('pan', e.target.value)} /></label>
          <label>CIN<input value={form.cin ?? ''} onChange={(e) => set('cin', e.target.value)} /></label>
          <label>MSME / Udyam No.<input value={form.msme ?? ''} onChange={(e) => set('msme', e.target.value)} /></label>
          <label>Tax Regime
            <select value={form.taxRegime ?? 'REGULAR'} onChange={(e) => set('taxRegime', e.target.value)}>
              {TAX_REGIMES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </label>
          <label>Financial Year
            <select value={form.financialYear ?? '2026-27'} onChange={(e) => set('financialYear', e.target.value)}>
              {FIN_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* GST API credentials (NIC e-Invoice / e-Way Bill via GSP) */}
      <div className="card">
        <div className="card-head">
          <h3 className="card-title">GST APIs — e-Invoice &amp; e-Way Bill</h3>
          <button className="btn-ghost" disabled={gspTesting} onClick={verifyGsp}>{gspTesting ? 'Testing…' : 'Test Connection'}</button>
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>
          Enter the API username &amp; password you created on the government e-Invoice / e-Way Bill portal for
          this GSTIN (distinct from your portal login). These let the app generate real IRNs and e-Way Bills
          through the GSP. On the NIC <b>sandbox</b>, use the test credentials supplied with your GSP account.
        </p>
        <div className="form-grid form-grid--2">
          <label>API Username
            <input value={form.gspUsername ?? ''} onChange={(e) => set('gspUsername', e.target.value)} placeholder="NIC API username" autoComplete="off" />
          </label>
          <label>API Password
            <input type="password" value={form.gspPassword ?? ''} onChange={(e) => set('gspPassword', e.target.value)} placeholder={form.gspPasswordSet ? 'unchanged — leave to keep' : ''} autoComplete="new-password" />
          </label>
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          The password is stored server-side and never shown here again. The GSP account (Client ID/Secret,
          base URL) is configured centrally by the platform operator.
        </p>
      </div>

      {/* Bank details */}
      <div className="card">
        <h3 className="card-title">Bank Details (shown on invoices)</h3>
        <div className="form-grid form-grid--2">
          <label>Account Name<input value={form.bankAccountName ?? ''} onChange={(e) => set('bankAccountName', e.target.value)} /></label>
          <label>Bank Name<input value={form.bankName ?? ''} onChange={(e) => set('bankName', e.target.value)} /></label>
          <label>Account Number<input value={form.bankAccountNumber ?? ''} onChange={(e) => set('bankAccountNumber', e.target.value)} /></label>
          <label>Branch<input value={form.bankBranch ?? ''} onChange={(e) => set('bankBranch', e.target.value)} /></label>
          <label>IFSC<input value={form.bankIfsc ?? ''} onChange={(e) => set('bankIfsc', e.target.value)} /></label>
          <label>UPI ID<input value={form.upiId ?? ''} onChange={(e) => set('upiId', e.target.value)} /></label>
        </div>
      </div>
      </>}

      {/* ── Terms & Conditions tab ── */}
      {tab === 'Terms & Conditions' && (
        <div className="card">
          <h3 className="card-title">Default Terms &amp; Conditions</h3>
          <textarea className="terms-input" rows={6} value={form.defaultTerms ?? ''} onChange={(e) => set('defaultTerms', e.target.value)} placeholder="One term per line — printed on every invoice by default." />
        </div>
      )}
    </section>
  );
}
