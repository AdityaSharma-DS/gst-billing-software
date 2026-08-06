import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Modal } from './Modal';
import { IconSearch } from './icons';
import { isValidGstin } from '../lib/gstin';
import { toast } from './Toaster';

interface Party {
  id: string; name: string; gstin: string | null; email?: string | null; phone?: string | null;
  billingAddress?: any; total: number; paid: number; outstanding: number;
}
interface Bill { id: string; billNumber: string; documentType: string; billDate: string; grandTotal: string; status: string; }

const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 });
const initial = (s: string) => (s?.trim()?.[0] ?? '?').toUpperCase();
const emptyForm = { name: '', address: '', pincode: '', city: '', state: '', gstin: '', email: '', phone: '' };

interface Config {
  type: 'CUSTOMER' | 'VENDOR';
  title: string;        // "Clients" / "Vendors"
  noun: string;         // "Client" / "Vendor"
  queryKey: string;     // 'clients' / 'vendors'
  billDirection: 'OUTGOING' | 'INCOMING';
  billNoun: string;     // "invoices" / "purchase bills"
  createTo: string;     // '/invoices/new' / '/purchases/new'
}

function PartyRow({ c, cfg, onEdit, onDelete }: { c: Party; cfg: Config; onEdit: (c: Party) => void; onDelete: (c: Party) => void }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const { data: bills = [] } = useQuery({
    queryKey: [`${cfg.queryKey}-bills`, c.id],
    enabled: open,
    queryFn: async () => (await api.get<Bill[]>(`/bills?direction=${cfg.billDirection}&partyId=${c.id}`)).data,
  });

  return (
    <div className="client-card">
      <div className="client-head">
        <div className="avatar">{initial(c.name)}</div>
        <div className="client-meta">
          <div className="cell-strong">{c.name}</div>
          <div className="muted small">{c.gstin ?? 'No GSTIN'}</div>
        </div>
        <div className="client-totals">
          <div><span className="muted small">Total</span><b>{inr(c.total)}</b></div>
          <div><span className="muted small">Paid</span><b className="pos">{inr(c.paid)}</b></div>
          <div><span className="muted small">Outstanding</span><b className={c.outstanding ? 'neg' : ''}>{inr(c.outstanding)}</b></div>
        </div>
        <button className="btn-ghost" onClick={() => setOpen((o) => !o)}>{open ? 'Hide ▴' : 'View ▾'}</button>
      </div>

      {open && (
        <div className="client-body">
          {bills.length === 0 ? (
            <div className="empty-inline">
              <span className="muted">No {cfg.billNoun} for this {cfg.noun.toLowerCase()} yet</span>
              <button className="btn-primary" onClick={() => nav(cfg.createTo)}>Create {cfg.type === 'CUSTOMER' ? 'Invoice' : 'Purchase'}</button>
            </div>
          ) : (
            <table className="data-table compact">
              <thead><tr><th>Date</th><th>No.</th><th>Type</th><th className="num">Amount</th><th>Status</th></tr></thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.id}>
                    <td className="muted">{new Date(b.billDate).toLocaleDateString('en-IN')}</td>
                    <td>{b.billNumber}</td>
                    <td className="muted">{b.documentType.replace('_', ' ')}</td>
                    <td className="num">{inr(Number(b.grandTotal))}</td>
                    <td><span className={`badge badge--${b.status.toLowerCase()}`}>{b.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="client-actions">
            <button className="link-btn" onClick={() => onEdit(c)}>Edit {cfg.noun}</button>
            <button className="link-btn danger" onClick={() => onDelete(c)}>Delete {cfg.noun}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PartyList({ cfg }: { cfg: Config }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [search, setSearch] = useState('');

  const { data: parties = [], isLoading } = useQuery({
    queryKey: [cfg.queryKey],
    queryFn: async () => (await api.get<Party[]>(`/parties?type=${cfg.type}`)).data,
  });

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        type: cfg.type, name: form.name, gstin: form.gstin || undefined, email: form.email || undefined, phone: form.phone || undefined,
        billingAddress: { address: form.address, pincode: form.pincode, city: form.city, state: form.state },
      };
      return editId ? (await api.patch(`/parties/${editId}`, body)).data : (await api.post('/parties', body)).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [cfg.queryKey] }); toast(`${cfg.noun} saved`); close(); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Save failed', 'error'),
  });
  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/parties/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: [cfg.queryKey] }); toast(`${cfg.noun} deleted`); },
  });

  function close() { setOpen(false); setEditId(null); setForm({ ...emptyForm }); }
  function openEdit(c: Party) {
    const a = c.billingAddress ?? {};
    setEditId(c.id);
    setForm({ name: c.name, address: a.address ?? '', pincode: a.pincode ?? '', city: a.city ?? '', state: a.state ?? '', gstin: c.gstin ?? '', email: c.email ?? '', phone: c.phone ?? '' });
    setOpen(true);
  }

  const filtered = parties.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <section className="page">
      <div className="page-head">
        <h2>{cfg.title}</h2>
        <div className="page-actions">
          <button className="btn-primary" onClick={() => { setForm({ ...emptyForm }); setEditId(null); setOpen(true); }}>+ Add {cfg.noun}</button>
        </div>
      </div>

      <div className="searchbox searchbox--wide"><IconSearch size={18} /><input placeholder={`Search ${cfg.title.toLowerCase()}`} value={search} onChange={(e) => setSearch(e.target.value)} /></div>

      {isLoading && <p className="muted">Loading…</p>}
      {!isLoading && filtered.length === 0 && <div className="card empty-state"><p className="muted">No {cfg.title.toLowerCase()} yet — add your first.</p></div>}
      <div className="client-list">
        {filtered.map((c) => (
          <PartyRow key={c.id} c={c} cfg={cfg} onEdit={openEdit} onDelete={(p) => confirm(`Delete ${p.name}?`) && del.mutate(p.id)} />
        ))}
      </div>

      {open && (
        <Modal
          title={editId ? `Edit ${cfg.noun}` : `Add ${cfg.noun}`}
          onClose={close}
          footer={<>
            <button className="btn-ghost" onClick={close}>Cancel</button>
            <button className="btn-primary" disabled={!form.name || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : `Save ${cfg.noun}`}</button>
          </>}
        >
          <div className="form-grid">
            <label className="span2">Business Name *<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="span2">Address<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
            <label>Pincode<input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} /></label>
            <label>City<input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
            <label>State<input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></label>
            <label>GSTIN<input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} placeholder="27ABCDE1234F1Z5" /></label>
            <label>Email<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          </div>
          {form.gstin && !isValidGstin(form.gstin) && <p className="warn-item">⚠ GSTIN checksum doesn't match — double-check before saving.</p>}
        </Modal>
      )}
    </section>
  );
}
