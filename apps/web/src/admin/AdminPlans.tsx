import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from './adminApi';
import { Modal } from '../components/Modal';
import { toast } from '../components/Toaster';

interface Plan { id: string; name: string; interval: 'MONTHLY' | 'QUARTERLY' | 'YEARLY'; priceInr: string; trialDays: number; limits?: any; isActive: boolean; }
const emptyForm = { id: '', name: '', interval: 'MONTHLY' as Plan['interval'], priceInr: 999, trialDays: 14, billsLimit: 1000, usersLimit: 5, isActive: true };
const inr = (n: string | number) => '₹' + Number(n).toLocaleString('en-IN');

export function AdminPlans() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  const { data: plans = [], isLoading } = useQuery({ queryKey: ['admin-plans'], queryFn: async () => (await adminApi.get<Plan[]>('/plans')).data });

  const save = useMutation({
    mutationFn: async () => (await adminApi.post('/plans', {
      id: form.id || undefined, name: form.name, interval: form.interval, priceInr: form.priceInr,
      trialDays: form.trialDays, isActive: form.isActive,
      limits: { bills: form.billsLimit, users: form.usersLimit },
    })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-plans'] }); toast('Plan saved'); setOpen(false); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Save failed', 'error'),
  });

  function openEdit(p?: Plan) {
    setForm(p ? {
      id: p.id, name: p.name, interval: p.interval, priceInr: Number(p.priceInr), trialDays: p.trialDays,
      billsLimit: p.limits?.bills ?? 1000, usersLimit: p.limits?.users ?? 5, isActive: p.isActive,
    } : { ...emptyForm });
    setOpen(true);
  }

  return (
    <section className="page">
      <div className="page-head">
        <h2>Plans &amp; Billing</h2>
        <button className="btn-primary" onClick={() => openEdit()}>+ New Plan</button>
      </div>
      <div className="card">
        <table className="data-table">
          <thead><tr><th>Plan</th><th>Interval</th><th className="num">Price</th><th className="num">Trial</th><th>Limits (bills / users)</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="muted">Loading…</td></tr>}
            {plans.map((p) => (
              <tr key={p.id}>
                <td className="cell-strong">{p.name}</td>
                <td className="muted">{p.interval.toLowerCase()}</td>
                <td className="num">{inr(p.priceInr)}</td>
                <td className="num">{p.trialDays}d</td>
                <td className="muted">{p.limits ? `${p.limits.bills === -1 ? '∞' : p.limits.bills} / ${p.limits.users === -1 ? '∞' : p.limits.users}` : '—'}</td>
                <td>{p.isActive ? <span className="badge badge--finalized">Active</span> : <span className="badge badge--cancelled">Retired</span>}</td>
                <td className="actions"><button className="link-btn" onClick={() => openEdit(p)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal
          title={form.id ? 'Edit Plan' : 'New Plan'}
          onClose={() => setOpen(false)}
          footer={<>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={!form.name || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save Plan'}</button>
          </>}
        >
          <div className="form-grid">
            <label>Name *<input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>Interval
              <select value={form.interval} onChange={(e) => setForm({ ...form, interval: e.target.value as Plan['interval'] })}>
                <option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="YEARLY">Yearly</option>
              </select>
            </label>
            <label>Price (₹)<input type="number" value={form.priceInr} onChange={(e) => setForm({ ...form, priceInr: +e.target.value })} /></label>
            <label>Trial days<input type="number" value={form.trialDays} onChange={(e) => setForm({ ...form, trialDays: +e.target.value })} /></label>
            <label>Bills limit (-1 = unlimited)<input type="number" value={form.billsLimit} onChange={(e) => setForm({ ...form, billsLimit: +e.target.value })} /></label>
            <label>Users limit (-1 = unlimited)<input type="number" value={form.usersLimit} onChange={(e) => setForm({ ...form, usersLimit: +e.target.value })} /></label>
            <label className="checkbox"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active (available for new licenses)</label>
          </div>
        </Modal>
      )}
    </section>
  );
}
