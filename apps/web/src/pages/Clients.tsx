import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Modal } from '../components/Modal';
import { IconSearch } from '../components/icons';

interface Client {
  id: string; name: string; gstin: string | null;
  total: number; paid: number; outstanding: number;
}

const inr = (n: number) => '₹' + n.toLocaleString('en-IN');

export function Clients() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', gstin: '', email: '', phone: '' });

  const { data: clients = [], isLoading, error } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => (await api.get<Client[]>('/parties?type=CUSTOMER')).data,
  });

  const create = useMutation({
    mutationFn: async () =>
      (await api.post('/parties', { type: 'CUSTOMER', name: form.name, gstin: form.gstin || undefined, email: form.email || undefined, phone: form.phone || undefined })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      setForm({ name: '', gstin: '', email: '', phone: '' });
      setOpen(false);
    },
  });

  return (
    <section className="page">
      <div className="page-head">
        <h2>Clients</h2>
        <div className="page-actions">
          <button className="btn-ghost">Last 7 Days</button>
          <button className="btn-ghost">Import CSV</button>
          <button className="btn-ghost">Filter</button>
          <button className="btn-primary" onClick={() => setOpen(true)}>+ Add Client</button>
        </div>
      </div>

      <div className="card">
        <div className="searchbox searchbox--inline"><IconSearch size={18} /><input placeholder="Search clients" /></div>
        {isLoading && <p className="muted">Loading…</p>}
        {error && <p className="error">Couldn't load clients (are you signed in?).</p>}
        <table className="data-table">
          <thead><tr><th>Client</th><th>GSTIN</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Outstanding</th><th></th></tr></thead>
          <tbody>
            {clients.length === 0 && !isLoading && <tr><td colSpan={6} className="muted">No clients yet — add your first.</td></tr>}
            {clients.map((c) => (
              <tr key={c.id}>
                <td><div className="cell-strong">{c.name}</div></td>
                <td className="muted mono">{c.gstin ?? '—'}</td>
                <td className="num">{inr(c.total)}</td>
                <td className="num pos">{inr(c.paid)}</td>
                <td className="num"><span className={c.outstanding ? 'neg' : 'muted'}>{inr(c.outstanding)}</span></td>
                <td className="num"><a>View ›</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal
          title="Add Client"
          onClose={() => setOpen(false)}
          footer={<>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={!form.name || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? 'Saving…' : 'Save Client'}
            </button>
          </>}
        >
          <div className="form-grid">
            <label>Business Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>GSTIN<input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} placeholder="27ABCDE1234F1Z5" /></label>
            <label>Email<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          </div>
          {create.isError && <p className="error">Save failed. Check fields and try again.</p>}
        </Modal>
      )}
    </section>
  );
}
