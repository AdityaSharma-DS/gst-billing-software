import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Modal } from '../components/Modal';
import { StateSelect } from '../components/StateSelect';
import { getDefaultState } from '../lib/states';
import { GST_RATES } from '../lib/gst';

const ADD_NEW = '__add_new__';
const emptyClient = { name: '', gstin: '', email: '', phone: '', address: '', pincode: '', city: '', state: '' };

type DocType = 'INVOICE' | 'CREDIT_NOTE' | 'DELIVERY_CHALLAN';
type InvType = 'TAX' | 'PROFORMA' | 'BILL_OF_SUPPLY';
interface Line { id: string; desc: string; hsn: string; qty: number; rate: number; unit: string; disc: number; gst: number; }
interface Party { id: string; name: string; }

const inr = (n: number) => '₹' + n.toFixed(2);
const newLine = (): Line => ({ id: String(Math.round(performance.now() * 1000) + Math.floor(Math.random() * 1000)), desc: '', hsn: '', qty: 1, rate: 0, unit: 'pcs', disc: 0, gst: 18 });

const INV_TYPES: { id: InvType; label: string }[] = [
  { id: 'TAX', label: 'Tax Invoice' }, { id: 'PROFORMA', label: 'Proforma / Estimate' }, { id: 'BILL_OF_SUPPLY', label: 'Bill of Supply (No GST)' },
];
const DOC_TYPES: { id: DocType; label: string }[] = [
  { id: 'INVOICE', label: 'General Invoice' }, { id: 'CREDIT_NOTE', label: 'Credit Note' }, { id: 'DELIVERY_CHALLAN', label: 'Delivery Challan' },
];

export function BillForm() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { id } = useParams();
  const loc = useLocation();
  const direction: 'OUTGOING' | 'INCOMING' = loc.pathname.startsWith('/purchases') ? 'INCOMING' : 'OUTGOING';
  const isEdit = !!id;

  const [invType, setInvType] = useState<InvType>('TAX');
  const [docType, setDocType] = useState<DocType>('INVOICE');
  const [partyId, setPartyId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [pos, setPos] = useState(getDefaultState() || '27');
  const [lang, setLang] = useState<'en' | 'hi'>('en');
  const [billDiscount, setBillDiscount] = useState(0);
  const [otherCharges, setOtherCharges] = useState(0);
  const [terms, setTerms] = useState('');
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  // Inline "add new client" modal
  const [addOpen, setAddOpen] = useState(false);
  const [nc, setNc] = useState({ ...emptyClient });
  const [ncSaving, setNcSaving] = useState(false);
  const [ncErr, setNcErr] = useState('');

  const { data: parties = [] } = useQuery({
    queryKey: ['parties', direction],
    queryFn: async () => (await api.get<Party[]>(`/parties?type=${direction === 'OUTGOING' ? 'CUSTOMER' : 'VENDOR'}`)).data,
  });

  useEffect(() => {
    if (!id) return;
    api.get(`/bills/${id}`).then(({ data }) => {
      setInvType((data.invoiceType ?? 'TAX') as InvType); setDocType(data.documentType); setPartyId(data.partyId ?? '');
      setDate(new Date(data.billDate).toISOString().slice(0, 10));
      if (data.dueDate) setDueDate(new Date(data.dueDate).toISOString().slice(0, 10));
      setPos(data.placeOfSupply ?? '27'); setLang(data.language === 'hi' ? 'hi' : 'en');
      setOtherCharges(Number(data.otherCharges ?? 0)); setTerms(data.terms ?? '');
      setLines((data.lineItems ?? []).map((l: any) => ({
        id: l.id, desc: l.description, hsn: l.hsnSacCode ?? '', qty: Number(l.quantity), rate: Number(l.rate), unit: l.unit ?? 'pcs', disc: Number(l.discount ?? 0), gst: Number(l.gstRate),
      })));
    });
  }, [id]);

  const update = (lid: string, k: keyof Line, v: string | number) => setLines((ls) => ls.map((l) => (l.id === lid ? { ...l, [k]: v } : l)));
  const noGst = invType === 'BILL_OF_SUPPLY';

  async function saveNewClient() {
    if (!nc.name.trim()) { setNcErr('Business name is required.'); return; }
    setNcErr(''); setNcSaving(true);
    try {
      const created = (await api.post('/parties', {
        type: direction === 'OUTGOING' ? 'CUSTOMER' : 'VENDOR',
        name: nc.name.trim(), gstin: nc.gstin || undefined, email: nc.email || undefined, phone: nc.phone || undefined,
        billingAddress: { address: nc.address, pincode: nc.pincode, city: nc.city, state: nc.state },
      })).data;
      // Refresh the dropdown list and auto-select the new client.
      await qc.invalidateQueries({ queryKey: ['parties', direction] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      setPartyId(created.id);
      setAddOpen(false); setNc({ ...emptyClient });
    } catch (e: any) {
      setNcErr(e?.response?.data?.message ?? 'Could not add client.');
    } finally { setNcSaving(false); }
  }

  const totals = useMemo(() => {
    let taxable = 0, tax = 0;
    for (const l of lines) { const t = Math.max(0, l.qty * l.rate - l.disc); taxable += t; tax += noGst ? 0 : (t * l.gst) / 100; }
    const raw = taxable + tax - billDiscount + otherCharges;
    const grand = Math.round(raw);
    return { taxable, tax, grand };
  }, [lines, billDiscount, otherCharges, noGst]);

  async function save(submit: boolean) {
    setErr(''); setSaving(true);
    try {
      const payload = {
        direction, documentType: docType, invoiceType: invType,
        billDate: new Date(date).toISOString(), dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        partyId: partyId || undefined, placeOfSupply: pos, language: lang, terms: terms || undefined,
        billDiscount, otherCharges,
        lineItems: lines.filter((l) => l.desc).map((l) => ({ description: l.desc, hsnSacCode: l.hsn || undefined, quantity: l.qty, unit: l.unit || undefined, rate: l.rate, discount: l.disc, gstRate: noGst ? 0 : l.gst })),
      };
      if (payload.lineItems.length === 0) { setErr('Add at least one line item.'); setSaving(false); return; }
      const saved = isEdit ? (await api.patch(`/bills/${id}`, payload)).data : (await api.post('/bills', payload)).data;
      if (submit && saved.status === 'DRAFT') await api.patch(`/bills/${saved.id}/status`, { status: 'APPROVED' });
      qc.invalidateQueries({ queryKey: ['bills'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); qc.invalidateQueries({ queryKey: ['clients'] });
      nav(direction === 'OUTGOING' ? '/invoices' : '/purchases');
    } catch (e: any) { setErr(e?.response?.data?.message ?? 'Save failed.'); }
    finally { setSaving(false); }
  }

  const partyLabel = direction === 'OUTGOING' ? 'Customer' : 'Vendor';

  return (
    <section className="page">
      <div className="page-head">
        <h2>{isEdit ? 'Edit' : 'New'} {direction === 'OUTGOING' ? 'Invoice' : 'Purchase'}</h2>
        <button className="btn-ghost" onClick={() => nav(direction === 'OUTGOING' ? '/invoices' : '/purchases')}>← Back</button>
      </div>

      {direction === 'OUTGOING' && (
        <>
          <div className="seg-row">
            <span className="seg-label">Invoice Type</span>
            {INV_TYPES.map((t) => (
              <button key={t.id} className={`seg ${invType === t.id ? 'seg--active' : ''}`} onClick={() => setInvType(t.id)}>{t.label}</button>
            ))}
          </div>
          <div className="tabs">
            {DOC_TYPES.map((t) => (
              <button key={t.id} className={`tab ${docType === t.id ? 'tab--active' : ''}`} onClick={() => setDocType(t.id)}>{t.label}</button>
            ))}
          </div>
        </>
      )}

      <div className="invoice-layout">
        <div className="card">
          <h4 className="section-label">Billed To</h4>
          <div className="form-grid form-grid--2">
            <label>{partyLabel} *
              <select
                value={partyId}
                onChange={(e) => { if (e.target.value === ADD_NEW) { setNc({ ...emptyClient }); setNcErr(''); setAddOpen(true); } else setPartyId(e.target.value); }}
              >
                <option value="">Select…</option>
                {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                <option value={ADD_NEW}>+ Add new {partyLabel.toLowerCase()}…</option>
              </select>
            </label>
            <StateSelect value={pos} onChange={setPos} label="Place of Supply (State)" />
          </div>

          <h4 className="section-label">Invoice Details</h4>
          <div className="form-grid form-grid--2">
            <label>Invoice Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label>Due Date<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
            <label>Invoice Language<select value={lang} onChange={(e) => setLang(e.target.value as any)}><option value="en">English</option><option value="hi">हिन्दी (Hindi)</option></select></label>
          </div>

          <h4 className="section-label">Item List</h4>
          <table className="data-table compact">
            <thead><tr><th>Description</th><th>HSN/SAC</th><th className="num">Qty</th><th>Unit</th><th className="num">Rate</th><th className="num">Disc</th><th className="num">GST%</th><th className="num">Amount</th><th></th></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td><input className="cell-input" value={l.desc} onChange={(e) => update(l.id, 'desc', e.target.value)} placeholder="Item / service" /></td>
                  <td><input className="cell-input w80" value={l.hsn} onChange={(e) => update(l.id, 'hsn', e.target.value)} /></td>
                  <td className="num"><input className="cell-input w60 num" type="number" value={l.qty} onChange={(e) => update(l.id, 'qty', +e.target.value)} /></td>
                  <td><input className="cell-input w60" value={l.unit} onChange={(e) => update(l.id, 'unit', e.target.value)} /></td>
                  <td className="num"><input className="cell-input w90 num" type="number" value={l.rate} onChange={(e) => update(l.id, 'rate', +e.target.value)} /></td>
                  <td className="num"><input className="cell-input w60 num" type="number" value={l.disc} onChange={(e) => update(l.id, 'disc', +e.target.value)} /></td>
                  <td className="num"><select className="cell-input w80" value={l.gst} disabled={noGst} onChange={(e) => update(l.id, 'gst', +e.target.value)}>{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</select></td>
                  <td className="num">{inr(Math.max(0, l.qty * l.rate - l.disc) * (1 + (noGst ? 0 : l.gst) / 100))}</td>
                  <td className="num"><button className="row-del" onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn-ghost" onClick={() => setLines([...lines, newLine()])}>+ Add Items</button>

          <div className="form-grid form-grid--2" style={{ marginTop: 16 }}>
            <label>Bill Discount (₹)<input type="number" value={billDiscount} onChange={(e) => setBillDiscount(+e.target.value)} /></label>
            <label>Other Charges (₹)<input type="number" value={otherCharges} onChange={(e) => setOtherCharges(+e.target.value)} /></label>
          </div>

          <h4 className="section-label">Terms &amp; Conditions</h4>
          <textarea className="terms-input" rows={3} placeholder="Create reusable terms and edit anytime as per use" value={terms} onChange={(e) => setTerms(e.target.value)} />
        </div>

        <div className="card invoice-preview">
          <div className="preview-head"><strong>DONICY</strong><span className="muted small">{isEdit ? 'Edit' : 'Preview'}</span></div>
          <div className="preview-row"><span className="muted">{INV_TYPES.find((t) => t.id === invType)?.label}</span><span>{DOC_TYPES.find((t) => t.id === docType)?.label}</span></div>
          <div className="preview-row"><span className="muted">{partyLabel}</span><span>{parties.find((p) => p.id === partyId)?.name ?? '—'}</span></div>
          <div className="preview-row"><span className="muted">Date</span><span>{date}{dueDate ? ` → ${dueDate}` : ''}</span></div>
          <div className="preview-items">
            {lines.filter((l) => l.desc).map((l) => (<div className="preview-item" key={l.id}><span>{l.desc} × {l.qty} {l.unit}</span><span>{inr(Math.max(0, l.qty * l.rate - l.disc))}</span></div>))}
          </div>
          <div className="preview-row"><span className="muted">Sub Total</span><span>{inr(totals.taxable)}</span></div>
          {!noGst && <div className="preview-row"><span className="muted">CGST + SGST / IGST</span><span>{inr(totals.tax)}</span></div>}
          {billDiscount > 0 && <div className="preview-row"><span className="muted">Bill Discount</span><span>-{inr(billDiscount)}</span></div>}
          {otherCharges > 0 && <div className="preview-row"><span className="muted">Other Charges</span><span>{inr(otherCharges)}</span></div>}
          <div className="preview-row total"><span>Total</span><span>{inr(totals.grand)}</span></div>
          {err && <p className="error center">{err}</p>}
          <button className="btn-ghost btn-block" disabled={saving} onClick={() => save(false)}>{saving ? 'Saving…' : 'Save as Draft'}</button>
          <button className="btn-primary btn-block" style={{ marginTop: 8 }} disabled={saving} onClick={() => save(true)}>Save &amp; Approve</button>
        </div>
      </div>

      {addOpen && (
        <Modal
          title={`Add New ${partyLabel}`}
          onClose={() => setAddOpen(false)}
          footer={<>
            <button className="btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={!nc.name || ncSaving} onClick={saveNewClient}>{ncSaving ? 'Saving…' : `Save ${partyLabel}`}</button>
          </>}
        >
          <div className="form-grid">
            <label className="span2">Business Name *<input autoFocus value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} /></label>
            <label className="span2">Address<input value={nc.address} onChange={(e) => setNc({ ...nc, address: e.target.value })} /></label>
            <label>Pincode<input value={nc.pincode} onChange={(e) => setNc({ ...nc, pincode: e.target.value })} /></label>
            <label>City<input value={nc.city} onChange={(e) => setNc({ ...nc, city: e.target.value })} /></label>
            <label>State<input value={nc.state} onChange={(e) => setNc({ ...nc, state: e.target.value })} /></label>
            <label>GSTIN<input value={nc.gstin} onChange={(e) => setNc({ ...nc, gstin: e.target.value })} placeholder="27ABCDE1234F1Z5" /></label>
            <label>Email<input value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} /></label>
            <label>Phone<input value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} /></label>
          </div>
          <p className="muted small">This {partyLabel.toLowerCase()} will be saved and selected for this invoice.</p>
          {ncErr && <p className="error">{ncErr}</p>}
        </Modal>
      )}
    </section>
  );
}
