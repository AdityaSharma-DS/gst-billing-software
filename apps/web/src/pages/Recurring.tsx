import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Modal } from '../components/Modal';
import { IconSearch } from '../components/icons';
import { GST_RATES } from '../lib/gst';
import { toast } from '../components/Toaster';

interface RItem { description: string; hsnSacCode?: string; quantity: number; rate: number; gstRate: number; }
interface Recurring {
  id: string; partyId: string | null; client: string; gstin: string | null; description: string | null;
  invoiceType: string; frequency: string; nextRunDate: string; paymentMode: string | null; active: boolean;
  items: RItem[]; taxable: number; gst: number; amount: number;
}
interface Party { id: string; name: string; gstin?: string | null; }

const inr = (n: number) => '₹' + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const d = (s: string) => new Date(s).toLocaleDateString('en-IN');
const FREqS = ['MONTHLY', 'QUARTERLY', 'YEARLY'];
const INV_TYPES: Record<string, string> = { TAX: 'Tax Invoice', PROFORMA: 'Proforma / Estimate', BILL_OF_SUPPLY: 'Bill of Supply' };
const PAYMENT_MODES = ['Cash', 'Bank Transfer', 'UPI', 'Card', 'Cheque'];
const newItem = (): RItem => ({ description: '', hsnSacCode: '', quantity: 1, rate: 0, gstRate: 18 });
const emptyForm = () => ({ partyId: '', description: '', invoiceType: 'TAX', frequency: 'MONTHLY', nextRunDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), paymentMode: 'Bank Transfer', items: [newItem()] });

export function Recurring() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());

  const { data: rows = [], isLoading } = useQuery({ queryKey: ['recurring'], queryFn: async () => (await api.get<Recurring[]>('/recurring')).data });
  const { data: parties = [] } = useQuery({ queryKey: ['parties', 'CUSTOMER'], queryFn: async () => (await api.get<Party[]>('/parties?type=CUSTOMER')).data });

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const setItem = (i: number, k: keyof RItem, v: any) => setForm((f) => ({ ...f, items: f.items.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)) }));

  const save = useMutation({
    mutationFn: async () => {
      const body = { ...form, items: form.items.filter((it) => it.description.trim()) };
      return editId ? (await api.patch(`/recurring/${editId}`, body)).data : (await api.post('/recurring', body)).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring'] }); toast(`Recurring profile ${editId ? 'updated' : 'created'}`); close(); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Save failed', 'error'),
  });
  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/recurring/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring'] }); toast('Recurring profile deleted'); },
  });
  const generate = useMutation({
    mutationFn: async (id: string) => (await api.post(`/recurring/${id}/generate`, {})).data,
    onSuccess: (r: any) => { qc.invalidateQueries({ queryKey: ['recurring'] }); qc.invalidateQueries({ queryKey: ['bills'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); toast(`Invoice ${r.bill.billNumber} generated · next run ${d(r.nextRunDate)}`); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Generation failed', 'error'),
  });

  function close() { setOpen(false); setEditId(null); setForm(emptyForm()); }
  function openEdit(r: Recurring) {
    setEditId(r.id);
    setForm({ partyId: r.partyId ?? '', description: r.description ?? '', invoiceType: r.invoiceType, frequency: r.frequency, nextRunDate: r.nextRunDate.slice(0, 10), paymentMode: r.paymentMode ?? '', items: r.items?.length ? r.items : [newItem()] });
    setOpen(true);
  }

  const filtered = rows.filter((r) => !q || r.client.toLowerCase().includes(q.toLowerCase()));
  const totalGst = filtered.reduce((s, r) => s + r.gst, 0);
  const totalAmt = filtered.reduce((s, r) => s + r.amount, 0);

  return (
    <section className="page">
      <div className="page-head">
        <h2>Recurring Clients</h2>
        <div className="page-actions">
          <button className="btn-primary" onClick={() => { setForm(emptyForm()); setEditId(null); setOpen(true); }}>+ Add Recurring</button>
        </div>
      </div>

      <div className="searchbox searchbox--wide"><IconSearch size={18} /><input placeholder="Search recurring clients" value={q} onChange={(e) => setQ(e.target.value)} /></div>

      <div className="card">
        <h3 className="card-title" style={{ color: 'var(--color-primary)' }}>Recurring Clients</h3>
        <table className="data-table compact">
          <thead><tr><th>Client</th><th>Description</th><th>Category</th><th className="num">GST</th><th className="num">Amount</th><th>Mode Of Payment</th><th>Frequency</th><th>Next Due</th><th>Actions</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={9} className="muted">Loading…</td></tr>}
            {!isLoading && filtered.length === 0 && <tr><td colSpan={9} className="muted">No recurring clients yet — add one to auto-generate invoices.</td></tr>}
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="cell-strong">{r.client}</td>
                <td className="muted">{r.description || '—'}</td>
                <td>{INV_TYPES[r.invoiceType] ?? r.invoiceType}</td>
                <td className="num muted">{inr(r.gst)}</td>
                <td className="num">{inr(r.amount)}</td>
                <td className="muted">{r.paymentMode ?? '—'}</td>
                <td>{r.frequency[0] + r.frequency.slice(1).toLowerCase()}</td>
                <td className="muted">{d(r.nextRunDate)}</td>
                <td className="actions">
                  <button className="link-btn" onClick={() => generate.mutate(r.id)} title="Generate an invoice now">Generate</button>
                  <button className="link-btn" onClick={() => openEdit(r)}>Edit</button>
                  <button className="link-btn danger" onClick={() => confirm(`Delete recurring profile for ${r.client}?`) && del.mutate(r.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {filtered.length > 0 && (
              <tr className="row-total"><td>Total</td><td></td><td></td><td className="num">{inr(totalGst)}</td><td className="num">{inr(totalAmt)}</td><td></td><td></td><td></td><td></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal
          title={editId ? 'Edit Recurring Client' : 'Add Recurring Client'}
          onClose={close}
          footer={<>
            <button className="btn-ghost" onClick={close}>Cancel</button>
            <button className="btn-primary" disabled={save.isPending || !form.items.some((i) => i.description.trim())} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save Recurring'}</button>
          </>}
        >
          <div className="form-grid">
            <label className="span2">Quick Select Client
              <select value={form.partyId} onChange={(e) => set('partyId', e.target.value)}>
                <option value="">Select client…</option>
                {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label>Frequency
              <select value={form.frequency} onChange={(e) => set('frequency', e.target.value)}>
                {FREqS.map((f) => <option key={f} value={f}>{f[0] + f.slice(1).toLowerCase()}</option>)}
              </select>
            </label>
            <label>Next Due Date<input type="date" value={form.nextRunDate} onChange={(e) => set('nextRunDate', e.target.value)} /></label>
            <label>Invoice Type
              <select value={form.invoiceType} onChange={(e) => set('invoiceType', e.target.value)}>
                {Object.entries(INV_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>Payment Mode
              <select value={form.paymentMode} onChange={(e) => set('paymentMode', e.target.value)}>
                <option value="">Select…</option>
                {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="span2">Description<input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="e.g. Monthly retainer" /></label>
          </div>

          <h4 className="section-label">List Items</h4>
          <table className="data-table compact">
            <thead><tr><th>Description</th><th>HSN/SAC</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">GST%</th><th></th></tr></thead>
            <tbody>
              {form.items.map((it, i) => (
                <tr key={i}>
                  <td><input className="cell-input" value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} /></td>
                  <td><input className="cell-input w80" value={it.hsnSacCode} onChange={(e) => setItem(i, 'hsnSacCode', e.target.value)} /></td>
                  <td className="num"><input className="cell-input w60 num" type="number" value={it.quantity} onChange={(e) => setItem(i, 'quantity', +e.target.value)} /></td>
                  <td className="num"><input className="cell-input w90 num" type="number" value={it.rate} onChange={(e) => setItem(i, 'rate', +e.target.value)} /></td>
                  <td className="num"><select className="cell-input w80" value={it.gstRate} onChange={(e) => setItem(i, 'gstRate', +e.target.value)}>{GST_RATES.map((g) => <option key={g} value={g}>{g}%</option>)}</select></td>
                  <td className="num"><button className="row-del" onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn-ghost" onClick={() => setForm((f) => ({ ...f, items: [...f.items, newItem()] }))}>+ Add Item</button>
        </Modal>
      )}
    </section>
  );
}
