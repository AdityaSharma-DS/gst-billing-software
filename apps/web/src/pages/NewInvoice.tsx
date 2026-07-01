import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

type DocType = 'General Invoice' | 'Credit Note' | 'Delivery Challan';
interface Line { id: string; desc: string; hsn: string; qty: number; rate: number; gst: number; }
interface Party { id: string; name: string; }

const inr = (n: number) => '₹' + n.toFixed(2);
const newLine = (): Line => ({ id: String(Math.round(performance.now() * 1000)), desc: '', hsn: '', qty: 1, rate: 0, gst: 18 });

export function NewInvoice() {
  const qc = useQueryClient();
  const [docType, setDocType] = useState<DocType>('General Invoice');
  const [partyId, setPartyId] = useState('');
  const [date, setDate] = useState('2026-06-29');
  const [pos, setPos] = useState('27');
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [saved, setSaved] = useState('');

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => (await api.get<Party[]>('/parties?type=CUSTOMER')).data,
  });

  const update = (id: string, k: keyof Line, v: string | number) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, [k]: v } : l)));

  const totals = useMemo(() => {
    let taxable = 0, tax = 0;
    for (const l of lines) { const t = l.qty * l.rate; taxable += t; tax += (t * l.gst) / 100; }
    return { taxable, tax, total: taxable + tax };
  }, [lines]);

  const save = useMutation({
    mutationFn: async () =>
      (await api.post('/bills', {
        direction: 'OUTGOING',
        billDate: new Date(date).toISOString(),
        partyId: partyId || undefined,
        placeOfSupply: pos,
        lineItems: lines.filter((l) => l.desc).map((l) => ({
          description: l.desc, hsnSacCode: l.hsn || undefined,
          quantity: l.qty, rate: l.rate, gstRate: l.gst,
        })),
      })).data,
    onSuccess: (bill: { billNumber?: string }) => {
      setSaved(`Saved ${bill?.billNumber ?? ''}`.trim());
      setLines([newLine()]);
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
  });

  const clientName = clients.find((c) => c.id === partyId)?.name ?? 'Select a client';

  return (
    <section className="page">
      <div className="page-head"><h2>New Invoice</h2></div>

      <div className="tabs">
        {(['General Invoice', 'Credit Note', 'Delivery Challan'] as DocType[]).map((t) => (
          <button key={t} className={`tab ${docType === t ? 'tab--active' : ''}`} onClick={() => setDocType(t)}>{t}</button>
        ))}
      </div>

      <div className="invoice-layout">
        <div className="card">
          <div className="form-grid form-grid--2">
            <label>Bill To (Client)
              <select value={partyId} onChange={(e) => setPartyId(e.target.value)}>
                <option value="">Select a client…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label>Place of Supply (state code)<input value={pos} onChange={(e) => setPos(e.target.value)} /></label>
            <label>Document<input value={docType} readOnly /></label>
          </div>

          <h4 className="section-label">Item List</h4>
          <table className="data-table compact">
            <thead><tr><th>Description</th><th>HSN/SAC</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">GST%</th><th className="num">Amount</th><th></th></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td><input className="cell-input" value={l.desc} onChange={(e) => update(l.id, 'desc', e.target.value)} placeholder="Item / service" /></td>
                  <td><input className="cell-input w80" value={l.hsn} onChange={(e) => update(l.id, 'hsn', e.target.value)} /></td>
                  <td className="num"><input className="cell-input w60 num" type="number" value={l.qty} onChange={(e) => update(l.id, 'qty', +e.target.value)} /></td>
                  <td className="num"><input className="cell-input w90 num" type="number" value={l.rate} onChange={(e) => update(l.id, 'rate', +e.target.value)} /></td>
                  <td className="num"><input className="cell-input w60 num" type="number" value={l.gst} onChange={(e) => update(l.id, 'gst', +e.target.value)} /></td>
                  <td className="num">{inr(l.qty * l.rate * (1 + l.gst / 100))}</td>
                  <td className="num"><button className="row-del" onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn-ghost" onClick={() => setLines([...lines, newLine()])}>+ Add Item</button>
        </div>

        <div className="card invoice-preview">
          <div className="preview-head"><strong>{docType}</strong><span className="muted small">Preview</span></div>
          <div className="preview-row"><span className="muted">Bill To</span><span>{clientName}</span></div>
          <div className="preview-row"><span className="muted">Date</span><span>{date}</span></div>
          <div className="preview-items">
            {lines.filter((l) => l.desc).map((l) => (
              <div className="preview-item" key={l.id}><span>{l.desc} × {l.qty}</span><span>{inr(l.qty * l.rate)}</span></div>
            ))}
          </div>
          <div className="preview-row"><span className="muted">Taxable</span><span>{inr(totals.taxable)}</span></div>
          <div className="preview-row"><span className="muted">GST</span><span>{inr(totals.tax)}</span></div>
          <div className="preview-row total"><span>Total</span><span>{inr(totals.total)}</span></div>
          <button className="btn-primary btn-block" disabled={save.isPending || !lines.some((l) => l.desc)} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : `Save ${docType}`}
          </button>
          {saved && <p className="pos small center" style={{ marginTop: 8 }}>{saved}</p>}
          {save.isError && <p className="error center">Save failed (sign in + add line items).</p>}
        </div>
      </div>
    </section>
  );
}
