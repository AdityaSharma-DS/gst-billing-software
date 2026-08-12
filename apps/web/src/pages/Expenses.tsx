import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Modal } from '../components/Modal';
import { IconSearch } from '../components/icons';
import { toast } from '../components/Toaster';

interface Expense {
  id: string; date: string; category: string | null; description: string;
  amount: string; gstAmount: string; businessName: string | null; businessGstin: string | null;
  invoiceBillNo: string | null; paymentMode: string | null; note: string | null; status: string;
}
interface Summary { total: number; totalGst: number; count: number; thisMonth: number; unpaid: number; unpaidCount: number; categories: string[]; }

const inr = (n: number) => '₹' + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const d = (s: string) => new Date(s).toLocaleDateString('en-IN');
const PAYMENT_MODES = ['Cash', 'Bank Transfer', 'UPI', 'Card', 'Cheque'];
const emptyForm = { date: new Date().toISOString().slice(0, 10), category: '', description: '', amount: 0, gstAmount: 0, businessName: '', businessGstin: '', invoiceBillNo: '', paymentMode: '', note: '', status: 'UNPAID' };

function fyOptions(): string[] {
  const now = new Date();
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return [0, 1, 2].map((i) => { const y = start - i; return `${y}-${String((y + 1) % 100).padStart(2, '0')}`; });
}

export function Expenses() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [fy, setFy] = useState('');
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const { data: summary } = useQuery({ queryKey: ['expense-summary'], queryFn: async () => (await api.get<Summary>('/expenses/summary')).data });
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['expenses', category, fy],
    queryFn: async () => (await api.get<Expense[]>(`/expenses?${category ? `category=${encodeURIComponent(category)}&` : ''}${fy ? `fy=${fy}` : ''}`)).data,
  });

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const body = { ...form };
      return editId ? (await api.patch(`/expenses/${editId}`, body)).data : (await api.post('/expenses', body)).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['expense-summary'] }); toast(`Expense ${editId ? 'updated' : 'added'}`); close(); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Save failed', 'error'),
  });
  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/expenses/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['expense-summary'] }); toast('Expense deleted'); },
  });
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => (await api.patch(`/expenses/${id}`, { status })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['expense-summary'] }); },
  });

  function close() { setOpen(false); setEditId(null); setForm({ ...emptyForm }); }
  function openEdit(x: Expense) {
    setEditId(x.id);
    setForm({ date: x.date.slice(0, 10), category: x.category ?? '', description: x.description, amount: Number(x.amount), gstAmount: Number(x.gstAmount), businessName: x.businessName ?? '', businessGstin: x.businessGstin ?? '', invoiceBillNo: x.invoiceBillNo ?? '', paymentMode: x.paymentMode ?? '', note: x.note ?? '', status: x.status });
    setOpen(true);
  }

  function exportCsv() {
    const token = localStorage.getItem('accessToken');
    api.get('/expenses/export', { responseType: 'blob' }).then((res) => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(res.data);
      a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
    }).catch(() => toast('Export failed', 'error'));
    void token;
  }

  const filtered = rows.filter((r) => !q || r.description.toLowerCase().includes(q.toLowerCase()) || (r.businessName ?? '').toLowerCase().includes(q.toLowerCase()));

  return (
    <section className="page">
      <div className="page-head">
        <h2>Expenses</h2>
        <div className="page-actions">
          <button className="btn-ghost" onClick={exportCsv}>Export CSV</button>
          <button className="btn-primary" onClick={() => { setForm({ ...emptyForm }); setEditId(null); setOpen(true); }}>+ Add Expense</button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card"><div className="stat-label">Total Expenses</div><div className="stat-value">{summary ? inr(summary.total) : '—'}</div><div className="muted small">{summary?.count ?? 0} entries · {summary ? inr(summary.totalGst) : '—'} GST</div></div>
        <div className="stat-card"><div className="stat-label">This Month</div><div className="stat-value">{summary ? inr(summary.thisMonth) : '—'}</div></div>
        <div className="stat-card"><div className="stat-label">Unpaid</div><div className="stat-value neg">{summary ? inr(summary.unpaid) : '—'}</div><div className="muted small">{summary?.unpaidCount ?? 0} pending</div></div>
      </div>

      <div className="card">
        <div className="filter-bar">
          <div className="searchbox searchbox--inline"><IconSearch size={18} /><input placeholder="Search description or business…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {(summary?.categories ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={fy} onChange={(e) => setFy(e.target.value)}>
            <option value="">All years</option>
            {fyOptions().map((y) => <option key={y} value={y}>FY {y}</option>)}
          </select>
        </div>

        <table className="data-table compact">
          <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Business</th><th className="num">Amount</th><th className="num">GST</th><th>Payment</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={9} className="muted">Loading…</td></tr>}
            {!isLoading && filtered.length === 0 && <tr><td colSpan={9} className="muted">No expenses yet — add your first.</td></tr>}
            {filtered.map((x) => (
              <tr key={x.id}>
                <td className="muted">{d(x.date)}</td>
                <td>{x.category ?? '—'}</td>
                <td className="cell-strong">{x.description}</td>
                <td>{x.businessName ?? '—'}{x.businessGstin && <div className="muted mono small">{x.businessGstin}</div>}</td>
                <td className="num">{inr(Number(x.amount))}</td>
                <td className="num muted">{inr(Number(x.gstAmount))}</td>
                <td className="muted">{x.paymentMode ?? '—'}</td>
                <td>
                  <select className="status-select" value={x.status} onChange={(e) => setStatus.mutate({ id: x.id, status: e.target.value })}>
                    <option value="UNPAID">Unpaid</option>
                    <option value="PAID">Paid</option>
                  </select>
                </td>
                <td className="actions">
                  <button className="link-btn" onClick={() => openEdit(x)}>Edit</button>
                  <button className="link-btn danger" onClick={() => confirm(`Delete "${x.description}"?`) && del.mutate(x.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal
          title={editId ? 'Edit Expense' : 'Add Expense'}
          onClose={close}
          footer={<>
            <button className="btn-ghost" onClick={close}>Cancel</button>
            <button className="btn-primary" disabled={!form.description || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save Expense'}</button>
          </>}
        >
          <div className="form-grid">
            <label>Date<input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} /></label>
            <label>Category<input value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="Rent, Utilities, Travel…" list="exp-cats" /></label>
            <datalist id="exp-cats">{(summary?.categories ?? []).map((c) => <option key={c} value={c} />)}</datalist>
            <label className="span2">Description *<input autoFocus value={form.description} onChange={(e) => set('description', e.target.value)} /></label>
            <label>Amount (₹)<input type="number" value={form.amount} onChange={(e) => set('amount', +e.target.value)} /></label>
            <label>GST (₹)<input type="number" value={form.gstAmount} onChange={(e) => set('gstAmount', +e.target.value)} /></label>
            <label>Business Name<input value={form.businessName} onChange={(e) => set('businessName', e.target.value)} /></label>
            <label>Business GSTIN<input value={form.businessGstin} onChange={(e) => set('businessGstin', e.target.value)} placeholder="27ABCDE1234F1Z5" /></label>
            <label>Invoice / Bill No.<input value={form.invoiceBillNo} onChange={(e) => set('invoiceBillNo', e.target.value)} /></label>
            <label>Payment Mode
              <select value={form.paymentMode} onChange={(e) => set('paymentMode', e.target.value)}>
                <option value="">Select…</option>
                {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="span2">Note<input value={form.note} onChange={(e) => set('note', e.target.value)} /></label>
            <label>Status
              <select value={form.status} onChange={(e) => set('status', e.target.value)}>
                <option value="UNPAID">Unpaid</option>
                <option value="PAID">Paid</option>
              </select>
            </label>
          </div>
        </Modal>
      )}
    </section>
  );
}
