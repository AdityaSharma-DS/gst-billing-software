import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from './adminApi';
import { Modal } from '../components/Modal';
import { toast } from '../components/Toaster';

interface Tenant {
  id: string; name: string; slug: string; status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  organization?: string | null; gstin?: string | null; users: number; bills: number;
  plan?: string | null; subscriptionStatus?: string | null; licenseExpiry?: string | null;
}
interface Plan { id: string; name: string; interval: string; priceInr: string; }

const d = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-IN') : '—');

export function AdminTenants() {
  const qc = useQueryClient();
  const [licTenant, setLicTenant] = useState<Tenant | null>(null);
  const [planId, setPlanId] = useState('');
  const [months, setMonths] = useState(12);

  const { data: tenants = [], isLoading } = useQuery({ queryKey: ['admin-tenants'], queryFn: async () => (await adminApi.get<Tenant[]>('/tenants')).data });
  const { data: plans = [] } = useQuery({ queryKey: ['admin-plans'], queryFn: async () => (await adminApi.get<Plan[]>('/plans')).data });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['admin-tenants'] }); qc.invalidateQueries({ queryKey: ['admin-overview'] }); };

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Tenant['status'] }) => (await adminApi.patch(`/tenants/${id}/status`, { status })).data,
    onSuccess: (_d, v) => { invalidate(); toast(`Tenant ${v.status === 'ACTIVE' ? 'activated' : v.status.toLowerCase()}`); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Failed', 'error'),
  });
  const assign = useMutation({
    mutationFn: async () => (await adminApi.post(`/tenants/${licTenant!.id}/subscription`, { planId, months })).data,
    onSuccess: (s: any) => { invalidate(); toast(`License: ${s.plan.name} until ${d(s.currentPeriodEnd)}`); setLicTenant(null); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Failed', 'error'),
  });

  return (
    <section className="page">
      <div className="page-head"><h2>Tenants &amp; Licenses</h2></div>
      <div className="card">
        <table className="data-table">
          <thead><tr><th>Tenant</th><th>GSTIN</th><th className="num">Users</th><th className="num">Bills</th><th>Plan</th><th>License Expiry</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="muted">Loading…</td></tr>}
            {tenants.map((t) => {
              const expired = t.licenseExpiry && new Date(t.licenseExpiry) < new Date();
              return (
                <tr key={t.id}>
                  <td><div className="cell-strong">{t.name}</div><div className="muted small">{t.organization ?? t.slug}</div></td>
                  <td className="muted mono">{t.gstin ?? '—'}</td>
                  <td className="num">{t.users}</td>
                  <td className="num">{t.bills}</td>
                  <td>{t.plan ?? <span className="muted">No plan</span>}</td>
                  <td className={expired ? 'neg' : ''}>{d(t.licenseExpiry)}{expired ? ' (expired)' : ''}</td>
                  <td>
                    <span className={`badge ${t.status === 'ACTIVE' ? 'badge--finalized' : t.status === 'SUSPENDED' ? 'badge--overdue' : 'badge--cancelled'}`}>{t.status}</span>
                  </td>
                  <td className="actions">
                    <button className="link-btn" onClick={() => { setLicTenant(t); setPlanId(plans[0]?.id ?? ''); setMonths(12); }}>Assign / Extend License</button>
                    {t.status === 'ACTIVE'
                      ? <button className="link-btn danger" onClick={() => confirm(`Suspend ${t.name}? All its users will be locked out.`) && setStatus.mutate({ id: t.id, status: 'SUSPENDED' })}>Suspend</button>
                      : <button className="link-btn" onClick={() => setStatus.mutate({ id: t.id, status: 'ACTIVE' })}>Activate</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {licTenant && (
        <Modal
          title={`License — ${licTenant.name}`}
          onClose={() => setLicTenant(null)}
          footer={<>
            <button className="btn-ghost" onClick={() => setLicTenant(null)}>Cancel</button>
            <button className="btn-primary" disabled={!planId || assign.isPending} onClick={() => assign.mutate()}>{assign.isPending ? 'Saving…' : 'Apply License'}</button>
          </>}
        >
          <div className="form-grid">
            <label>Plan
              <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — ₹{Number(p.priceInr).toLocaleString('en-IN')}/{p.interval.toLowerCase()}</option>)}
              </select>
            </label>
            <label>Duration (months)<input type="number" min={1} value={months} onChange={(e) => setMonths(+e.target.value)} /></label>
          </div>
          <p className="muted small">Current expiry: {d(licTenant.licenseExpiry)}. Extension adds to the current expiry when still valid, otherwise starts today.</p>
        </Modal>
      )}
    </section>
  );
}
