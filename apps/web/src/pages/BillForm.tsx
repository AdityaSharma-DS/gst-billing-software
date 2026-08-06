import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Modal } from '../components/Modal';
import { StateSelect } from '../components/StateSelect';
import { getDefaultState, stateName } from '../lib/states';
import { GST_RATES } from '../lib/gst';
import { isValidGstin, gstinStateCode } from '../lib/gstin';
import { autoDueDate } from '../lib/dates';
import { ItemPicker } from '../components/ItemPicker';
import { useBarcodeScanner } from '../components/useBarcodeScanner';
import { getScannerPrefs } from '../lib/scanner';
import { toast } from '../components/Toaster';

type DocType = 'INVOICE' | 'CREDIT_NOTE' | 'DELIVERY_CHALLAN';
type InvType = 'TAX' | 'PROFORMA' | 'BILL_OF_SUPPLY';
interface Line { id: string; desc: string; hsn: string; qty: number; rate: number; unit: string; disc: number; gst: number; }
interface Party { id: string; name: string; gstin?: string | null; }
interface Product { id: string; name: string; hsnSacCode?: string | null; unit?: string | null; rate: string; gstRate: string; }

const ADD_NEW = '__add_new__';
const emptyClient = { name: '', gstin: '', email: '', phone: '', address: '', pincode: '', city: '', state: '' };
const LARGE_INVOICE = 500000; // fat-finger guard threshold (₹5L)

const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  // Auto due date: +30 days (rolls Sunday → Monday). User edits stick.
  const [dueDate, setDueDate] = useState(autoDueDate(today));
  const [dueTouched, setDueTouched] = useState(false);
  const [pos, setPos] = useState(getDefaultState() || '27');
  const [lang, setLang] = useState<'en' | 'hi'>('en');
  const [billDiscount, setBillDiscount] = useState(0);
  const [otherCharges, setOtherCharges] = useState(0);
  const [terms, setTerms] = useState('');
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<{ id: string; billNumber: string; grandTotal: number } | null>(null);

  // Inline "add new client" modal
  const [addOpen, setAddOpen] = useState(false);
  const [nc, setNc] = useState({ ...emptyClient });
  const [ncSaving, setNcSaving] = useState(false);
  const [ncErr, setNcErr] = useState('');

  // Barcode scan + inline "new item" modal
  const [barcode, setBarcode] = useState('');
  const [itemOpen, setItemOpen] = useState(false);
  const [ni, setNi] = useState({ name: '', barcode: '', hsn: '', unit: 'pcs', rate: 0, gst: 18 });
  const [niSaving, setNiSaving] = useState(false);

  const { data: parties = [] } = useQuery({
    queryKey: ['parties', direction],
    queryFn: async () => (await api.get<Party[]>(`/parties?type=${direction === 'OUTGOING' ? 'CUSTOMER' : 'VENDOR'}`)).data,
  });
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.get<Product[]>('/products')).data,
  });

  useEffect(() => {
    if (!id) return;
    api.get(`/bills/${id}`).then(({ data }) => {
      setInvType((data.invoiceType ?? 'TAX') as InvType); setDocType(data.documentType); setPartyId(data.partyId ?? '');
      setDate(new Date(data.billDate).toISOString().slice(0, 10));
      if (data.dueDate) setDueDate(new Date(data.dueDate).toISOString().slice(0, 10));
      setDueTouched(true); // don't auto-recompute when editing an existing bill
      setPos(data.placeOfSupply ?? '27'); setLang(data.language === 'hi' ? 'hi' : 'en');
      setOtherCharges(Number(data.otherCharges ?? 0)); setTerms(data.terms ?? '');
      setLines((data.lineItems ?? []).map((l: any) => ({
        id: l.id, desc: l.description, hsn: l.hsnSacCode ?? '', qty: Number(l.quantity), rate: Number(l.rate), unit: l.unit ?? 'pcs', disc: Number(l.discount ?? 0), gst: Number(l.gstRate),
      })));
    });
  }, [id]);

  const update = (lid: string, k: keyof Line, v: string | number) => setLines((ls) => ls.map((l) => (l.id === lid ? { ...l, [k]: v } : l)));

  const noGst = invType === 'BILL_OF_SUPPLY';

  const appendProduct = (p: { name: string; hsnSacCode?: string | null; unit?: string | null; rate: any; gstRate: any }) =>
    setLines((ls) => [...ls, { ...newLine(), desc: p.name, hsn: p.hsnSacCode ?? '', unit: p.unit ?? 'pcs', rate: Number(p.rate) || 0, gst: Number(p.gstRate) || 18 }]);

  async function onScan(code: string) {
    const c = code.trim(); if (!c) return;
    setBarcode('');
    try {
      const { data } = await api.get(`/products/barcode/${encodeURIComponent(c)}`);
      if (data && data.id) { appendProduct(data); toast(`Added: ${data.name}`); }
      else { setNi({ name: '', barcode: c, hsn: '', unit: 'pcs', rate: 0, gst: 18 }); setItemOpen(true); toast('Barcode not found — add it as a new item', 'info'); }
    } catch { toast('Lookup failed', 'error'); }
  }

  // Hardware barcode device: capture scans anywhere on this page.
  const scannerPrefs = getScannerPrefs();
  useBarcodeScanner(onScan, { enabled: scannerPrefs.enabled, suffix: scannerPrefs.suffix, minLength: scannerPrefs.minLength });

  async function saveNewItem() {
    if (!ni.name.trim()) return;
    setNiSaving(true);
    try {
      const { data } = await api.post('/products', { name: ni.name.trim(), barcode: ni.barcode || undefined, hsnSacCode: ni.hsn || undefined, unit: ni.unit || undefined, rate: ni.rate, gstRate: ni.gst });
      appendProduct(data);
      qc.invalidateQueries({ queryKey: ['products'] });
      setItemOpen(false); toast(`${data.name} added to inventory`);
    } catch (e: any) { toast(e?.response?.data?.message ?? 'Could not add item', 'error'); }
    finally { setNiSaving(false); }
  }

  const totals = useMemo(() => {
    let taxable = 0, tax = 0;
    for (const l of lines) { const t = Math.max(0, l.qty * l.rate - l.disc); taxable += t; tax += noGst ? 0 : (t * l.gst) / 100; }
    const raw = taxable + tax - billDiscount + otherCharges;
    const grand = Math.round(raw);
    return { taxable, tax, grand };
  }, [lines, billDiscount, otherCharges, noGst]);

  const party = parties.find((p) => p.id === partyId);

  /** Pre-save warnings (non-blocking). */
  const warnings = useMemo(() => {
    const w: string[] = [];
    if (party?.gstin && !isValidGstin(party.gstin)) w.push(`${party.name}'s GSTIN "${party.gstin}" fails the checksum — please verify.`);
    const clientState = gstinStateCode(party?.gstin);
    if (clientState && pos && clientState !== pos) {
      w.push(`Place of supply (${pos} — ${stateName(pos)}) differs from the client's GSTIN state (${clientState} — ${stateName(clientState)}). IGST will apply — confirm this is intended.`);
    }
    if (dueDate && dueDate < date) w.push('Due date is before the invoice date.');
    if (totals.grand >= LARGE_INVOICE) w.push(`Large invoice value (${inr(totals.grand)}) — double-check quantities and rates.`);
    const zeroRate = lines.filter((l) => l.desc && l.rate === 0).length;
    if (zeroRate > 0) w.push(`${zeroRate} item(s) have a rate of ₹0.`);
    return w;
  }, [party, pos, dueDate, date, totals.grand, lines]);

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
      qc.invalidateQueries({ queryKey: ['bills'] }); qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['clients'] }); qc.invalidateQueries({ queryKey: ['products'] });
      setSuccess({ id: saved.id, billNumber: saved.billNumber, grandTotal: Number(saved.grandTotal) });
      toast(`${saved.billNumber} saved${submit ? ' & approved' : ''}`);
    } catch (e: any) { setErr(e?.response?.data?.message ?? 'Save failed.'); toast('Save failed', 'error'); }
    finally { setSaving(false); }
  }

  async function saveNewClient() {
    if (!nc.name.trim()) { setNcErr('Business name is required.'); return; }
    if (nc.gstin && !isValidGstin(nc.gstin)) { setNcErr('GSTIN is invalid (checksum failed). Fix it or leave blank.'); return; }
    setNcErr(''); setNcSaving(true);
    try {
      const created = (await api.post('/parties', {
        type: direction === 'OUTGOING' ? 'CUSTOMER' : 'VENDOR',
        name: nc.name.trim(), gstin: nc.gstin || undefined, email: nc.email || undefined, phone: nc.phone || undefined,
        billingAddress: { address: nc.address, pincode: nc.pincode, city: nc.city, state: nc.state },
      })).data;
      await qc.invalidateQueries({ queryKey: ['parties', direction] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      setPartyId(created.id);
      setAddOpen(false); setNc({ ...emptyClient });
      toast(`${created.name} added`);
    } catch (e: any) { setNcErr(e?.response?.data?.message ?? 'Could not add client.'); }
    finally { setNcSaving(false); }
  }

  function openPdf(billId: string, billNumber: string) {
    const token = localStorage.getItem('accessToken');
    window.open(`/api/bills/${billId}/pdf/${billNumber}.pdf?token=${token}`, '_blank');
  }

  function resetForm() {
    setSuccess(null); setPartyId(''); setDueDate(''); setTerms(''); setErr('');
    setBillDiscount(0); setOtherCharges(0); setLines([newLine()]);
  }

  const partyLabel = direction === 'OUTGOING' ? 'Customer' : 'Vendor';
  const listUrl = direction === 'OUTGOING' ? '/invoices' : '/purchases';

  return (
    <section className="page page--with-totalbar">
      <div className="page-head">
        <h2>{isEdit ? 'Edit' : 'New'} {direction === 'OUTGOING' ? 'Invoice' : 'Purchase'}</h2>
        <button className="btn-ghost" onClick={() => nav(listUrl)}>← Back</button>
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
            <label>Invoice Date<input type="date" value={date} onChange={(e) => { setDate(e.target.value); if (!dueTouched) setDueDate(autoDueDate(e.target.value)); }} /></label>
            <label>Due Date <span className="hint-inline">{dueTouched ? '' : '(auto: +30 days)'}</span>
              <input type="date" value={dueDate} onChange={(e) => { setDueDate(e.target.value); setDueTouched(true); }} />
            </label>
            <label>Invoice Language<select value={lang} onChange={(e) => setLang(e.target.value as any)}><option value="en">English</option><option value="hi">हिन्दी (Hindi)</option></select></label>
          </div>

          <h4 className="section-label">Item List</h4>
          <div className="item-toolbar">
            <input
              className="barcode-input"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onScan(barcode); } }}
              placeholder="📷 Scan barcode (or type + Enter)"
            />
            <button className="btn-ghost" onClick={() => { setNi({ name: '', barcode: '', hsn: '', unit: 'pcs', rate: 0, gst: 18 }); setItemOpen(true); }}>+ New Item</button>
            {scannerPrefs.enabled && <span className="scanner-chip" title="Hardware scanner active — scan anywhere on this page">● Scanner ready</span>}
          </div>
          <table className="data-table compact">
            <thead><tr><th>Description</th><th>HSN/SAC</th><th className="num">Qty</th><th>Unit</th><th className="num">Rate</th><th className="num">Disc</th><th className="num">GST%</th><th className="num">Amount</th><th></th></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    <ItemPicker
                      value={l.desc}
                      products={products}
                      onText={(v) => update(l.id, 'desc', v)}
                      onPick={(p) => setLines((ls) => ls.map((x) => x.id === l.id
                        ? { ...x, desc: p.name, hsn: p.hsnSacCode ?? x.hsn, unit: p.unit ?? x.unit, rate: Number(p.rate) || x.rate, gst: Number(p.gstRate) }
                        : x))}
                    />
                  </td>
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
          <textarea className="terms-input" rows={3} placeholder="Leave blank to use your default terms from Settings" value={terms} onChange={(e) => setTerms(e.target.value)} />
        </div>

        <div className="card invoice-preview">
          <div className="preview-head"><strong>DONICY</strong><span className="muted small">{isEdit ? 'Edit' : 'Preview'}</span></div>
          <div className="preview-row"><span className="muted">{INV_TYPES.find((t) => t.id === invType)?.label}</span><span>{DOC_TYPES.find((t) => t.id === docType)?.label}</span></div>
          <div className="preview-row"><span className="muted">{partyLabel}</span><span>{party?.name ?? '—'}</span></div>
          <div className="preview-row"><span className="muted">Date</span><span>{date}{dueDate ? ` → ${dueDate}` : ''}</span></div>
          <div className="preview-items">
            {lines.filter((l) => l.desc).map((l) => (<div className="preview-item" key={l.id}><span>{l.desc} × {l.qty} {l.unit}</span><span>{inr(Math.max(0, l.qty * l.rate - l.disc))}</span></div>))}
          </div>
          <div className="preview-row"><span className="muted">Sub Total</span><span>{inr(totals.taxable)}</span></div>
          {!noGst && <div className="preview-row"><span className="muted">GST</span><span>{inr(totals.tax)}</span></div>}
          {billDiscount > 0 && <div className="preview-row"><span className="muted">Bill Discount</span><span>-{inr(billDiscount)}</span></div>}
          {otherCharges > 0 && <div className="preview-row"><span className="muted">Other Charges</span><span>{inr(otherCharges)}</span></div>}
          <div className="preview-row total"><span>Total</span><span>{inr(totals.grand)}</span></div>
        </div>
      </div>

      {/* Sticky total + actions bar */}
      <div className="total-bar">
        <div className="total-bar-warnings">
          {warnings.map((w, i) => <div key={i} className="warn-item">⚠ {w}</div>)}
          {err && <div className="warn-item warn-item--error">{err}</div>}
        </div>
        <div className="total-bar-main">
          <div className="total-bar-amount">
            <span className="muted small">Grand Total</span>
            <strong>{inr(totals.grand)}</strong>
          </div>
          <button className="btn-ghost" disabled={saving} onClick={() => save(false)}>{saving ? 'Saving…' : 'Save as Draft'}</button>
          <button className="btn-primary btn-lg" disabled={saving} onClick={() => save(true)}>{saving ? 'Saving…' : 'Save & Approve'}</button>
        </div>
      </div>

      {/* Save success popup */}
      {success && (
        <Modal title="Saved successfully" onClose={() => { setSuccess(null); nav(listUrl); }}>
          <div className="success-pop">
            <div className="success-check">✓</div>
            <div className="success-num">{success.billNumber}</div>
            <div className="success-amt">{inr(success.grandTotal)}</div>
            <div className="success-actions">
              <button className="btn-ghost" onClick={() => openPdf(success.id, success.billNumber)}>View PDF</button>
              <button className="btn-ghost" onClick={resetForm}>+ New {direction === 'OUTGOING' ? 'Invoice' : 'Purchase'}</button>
              <button className="btn-primary" onClick={() => { setSuccess(null); nav(listUrl); }}>Done</button>
            </div>
          </div>
        </Modal>
      )}

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
          {nc.gstin && !isValidGstin(nc.gstin) && <p className="warn-item">⚠ GSTIN checksum doesn't match — double-check before saving.</p>}
          <p className="muted small">This {partyLabel.toLowerCase()} will be saved and selected for this invoice.</p>
          {ncErr && <p className="error">{ncErr}</p>}
        </Modal>
      )}

      {itemOpen && (
        <Modal
          title="Add New Item"
          onClose={() => setItemOpen(false)}
          footer={<>
            <button className="btn-ghost" onClick={() => setItemOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={!ni.name || niSaving} onClick={saveNewItem}>{niSaving ? 'Saving…' : 'Add Item'}</button>
          </>}
        >
          <div className="form-grid">
            <label className="span2">Item / Service Name *<input autoFocus value={ni.name} onChange={(e) => setNi({ ...ni, name: e.target.value })} /></label>
            <label>Barcode<input value={ni.barcode} onChange={(e) => setNi({ ...ni, barcode: e.target.value })} placeholder="Scan or type" /></label>
            <label>HSN/SAC<input value={ni.hsn} onChange={(e) => setNi({ ...ni, hsn: e.target.value })} /></label>
            <label>Unit<input value={ni.unit} onChange={(e) => setNi({ ...ni, unit: e.target.value })} /></label>
            <label>Rate (₹)<input type="number" value={ni.rate} onChange={(e) => setNi({ ...ni, rate: +e.target.value })} /></label>
            <label>GST %<select value={ni.gst} onChange={(e) => setNi({ ...ni, gst: +e.target.value })}>{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</select></label>
          </div>
          <p className="muted small">Saved to inventory and added to this invoice.</p>
        </Modal>
      )}
    </section>
  );
}
