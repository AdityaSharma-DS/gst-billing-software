import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Modal } from '../components/Modal';
import { IconSearch } from '../components/icons';
import { GST_RATES } from '../lib/gst';
import { toast } from '../components/Toaster';

interface Product { id: string; name: string; barcode?: string | null; hsnSacCode?: string | null; unit?: string | null; rate: string; gstRate: string; }
interface ImportResult { created: number; updated: number; failed: number; errors: { row: number; message: string }[]; }

const inr = (n: string | number) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const emptyForm = { name: '', barcode: '', hsnSacCode: '', unit: 'pcs', rate: 0, gstRate: 18 };

export function Inventory() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.get<Product[]>('/products')).data,
  });

  const save = useMutation({
    mutationFn: async () => editId
      ? (await api.patch(`/products/${editId}`, { ...form, name: form.name.trim() })).data
      : (await api.post('/products', form)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast(editId ? 'Item updated' : 'Item added'); close(); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Save failed', 'error'),
  });
  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/products/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast('Item deleted'); },
  });

  function close() { setOpen(false); setEditId(null); setForm({ ...emptyForm }); }
  function openEdit(p: Product) {
    setEditId(p.id);
    setForm({ name: p.name, barcode: p.barcode ?? '', hsnSacCode: p.hsnSacCode ?? '', unit: p.unit ?? 'pcs', rate: Number(p.rate), gstRate: Number(p.gstRate) });
    setOpen(true);
  }

  async function downloadTemplate() {
    const res = await api.get('/products/import/template', { responseType: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(res.data); a.download = 'inventory-import-template.csv'; a.click();
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setImporting(true); setImportResult(null);
    try {
      const csv = await f.text();
      const { data } = await api.post<ImportResult>('/products/import', { csv });
      setImportResult(data);
      qc.invalidateQueries({ queryKey: ['products'] });
      toast(`Imported: ${data.created} new, ${data.updated} updated${data.failed ? `, ${data.failed} failed` : ''}`, data.failed ? 'info' : 'success');
    } catch { toast('Import failed', 'error'); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  const filtered = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <section className="page">
      <div className="page-head">
        <h2>Inventory — Products &amp; Services</h2>
        <div className="page-actions">
          <button className="btn-ghost" onClick={downloadTemplate}>Download Template</button>
          <input ref={fileRef} type="file" accept=".csv" hidden onChange={onImportFile} />
          <button className="btn-ghost" disabled={importing} onClick={() => fileRef.current?.click()}>{importing ? 'Importing…' : 'Import CSV'}</button>
          <button className="btn-primary" onClick={() => { setForm({ ...emptyForm }); setEditId(null); setOpen(true); }}>+ Add Item</button>
        </div>
      </div>

      {importResult && (importResult.failed > 0) && (
        <div className="card">
          <p className="neg">Failed rows: {importResult.failed}</p>
          <ul>{importResult.errors.map((e, i) => <li key={i} className="small muted">Row {e.row}: {e.message}</li>)}</ul>
        </div>
      )}

      <div className="card">
        <div className="searchbox searchbox--inline"><IconSearch size={18} /><input placeholder="Search items" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <table className="data-table">
          <thead><tr><th>Item</th><th>Barcode</th><th>HSN/SAC</th><th>Unit</th><th className="num">Rate</th><th className="num">GST%</th><th>Actions</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="muted">Loading…</td></tr>}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={7} className="muted">No items yet — add one, import a CSV, or just save a bill (items are learned automatically).</td></tr>
            )}
            {filtered.map((p) => (
              <tr key={p.id}>
                <td className="cell-strong">{p.name}</td>
                <td className="muted mono">{p.barcode ?? '—'}</td>
                <td className="muted mono">{p.hsnSacCode ?? '—'}</td>
                <td className="muted">{p.unit ?? '—'}</td>
                <td className="num">{inr(p.rate)}</td>
                <td className="num">{Number(p.gstRate)}%</td>
                <td className="actions">
                  <button className="link-btn" onClick={() => openEdit(p)}>Edit</button>
                  <button className="link-btn danger" onClick={() => confirm(`Delete "${p.name}"?`) && del.mutate(p.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal
          title={editId ? 'Edit Item' : 'Add Item'}
          onClose={close}
          footer={<>
            <button className="btn-ghost" onClick={close}>Cancel</button>
            <button className="btn-primary" disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save Item'}</button>
          </>}
        >
          <div className="form-grid">
            <label className="span2">Item / Service Name *<input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>Barcode<input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="Scan or type" /></label>
            <label>HSN/SAC<input value={form.hsnSacCode} onChange={(e) => setForm({ ...form, hsnSacCode: e.target.value })} /></label>
            <label>Unit<input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="pcs / kg / hrs" /></label>
            <label>Rate (₹)<input type="number" value={form.rate} onChange={(e) => setForm({ ...form, rate: +e.target.value })} /></label>
            <label>GST %
              <select value={form.gstRate} onChange={(e) => setForm({ ...form, gstRate: +e.target.value })}>
                {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
              </select>
            </label>
          </div>
        </Modal>
      )}
    </section>
  );
}
