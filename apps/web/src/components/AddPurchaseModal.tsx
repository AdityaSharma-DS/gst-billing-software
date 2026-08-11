import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Modal } from './Modal';
import { StateSelect } from './StateSelect';
import { getDefaultState } from '../lib/states';
import { GST_RATES } from '../lib/gst';

interface Item { id: string; desc: string; qty: number; rate: number; gst: number; }
interface Vendor { id: string; name: string; }

const PAYMENT_STATUSES = ['UNPAID', 'PAID', 'PARTIAL', 'OVERDUE'];
const PAYMENT_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Cheque'];
const newItem = (): Item => ({ id: String(Math.round(performance.now() * 1000) + Math.floor(Math.random() * 1000)), desc: '', qty: 1, rate: 0, gst: 18 });

export function AddPurchaseModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentStatus, setPaymentStatus] = useState('UNPAID');
  const [businessName, setBusinessName] = useState('');
  const [gstin, setGstin] = useState('');
  const [vendorInvoiceNo, setVendorInvoiceNo] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [stateCode, setStateCode] = useState(getDefaultState()); // pre-fill locked default
  const [description, setDescription] = useState('');
  const [itcBlocked, setItcBlocked] = useState(false);
  const [items, setItems] = useState<Item[]>([newItem()]);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: vendors = [] } = useQuery({
    queryKey: ['parties', 'INCOMING'],
    queryFn: async () => (await api.get<Vendor[]>('/parties?type=VENDOR')).data,
  });

  const update = (id: string, k: keyof Item, v: string | number) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, [k]: v } : x)));
  const total = items.reduce((s, i) => s + i.qty * i.rate * (1 + i.gst / 100), 0);

  async function save() {
    setErr('');
    if (!businessName.trim()) { setErr('Business name is required.'); return; }
    const lineItems = items.filter((i) => i.desc).map((i) => ({ description: i.desc, quantity: i.qty, rate: i.rate, gstRate: i.gst }));
    if (lineItems.length === 0) { setErr('Add at least one item.'); return; }
    setSaving(true);
    try {
      // Find-or-create the vendor, then attach the purchase bill to it.
      let partyId = vendors.find((v) => v.name.toLowerCase() === businessName.trim().toLowerCase())?.id;
      if (!partyId) {
        partyId = (await api.post('/parties', {
          type: 'VENDOR', name: businessName.trim(), gstin: gstin || undefined,
          billingAddress: { state: stateCode },
        })).data.id;
      }
      await api.post('/bills', {
        direction: 'INCOMING', billDate: new Date(date).toISOString(),
        partyId, placeOfSupply: stateCode || undefined,
        vendorInvoiceNo: vendorInvoiceNo || undefined, paymentStatus, paymentMode: paymentMode || undefined,
        itcBlocked, notes: description || undefined, lineItems,
      });
      onSaved(); onClose();
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Could not save purchase bill.');
    } finally { setSaving(false); }
  }

  return (
    <Modal
      title="Add Purchase Bill"
      onClose={onClose}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={saving || !businessName} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
      </>}
    >
      <div className="form-grid">
        <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Payment Status
          <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
            {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}
          </select>
        </label>

        <label>Business Name *<input list="vendor-names" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Vendor name" /></label>
        <datalist id="vendor-names">{vendors.map((v) => <option key={v.id} value={v.name} />)}</datalist>
        <label>Business GSTIN<input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="27ABCDE1234F1Z5" /></label>

        <label>Invoice Bill No.<input value={vendorInvoiceNo} onChange={(e) => setVendorInvoiceNo(e.target.value)} placeholder="Supplier's bill no." /></label>
        <label>Payment Mode
          <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
            <option value="">Select…</option>
            {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>

        <StateSelect value={stateCode} onChange={setStateCode} label="Place of Supply (State)" />
        <label>Description<input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional note" /></label>
        <label className="checkbox span2"><input type="checkbox" checked={itcBlocked} onChange={(e) => setItcBlocked(e.target.checked)} /> ITC blocked under Sec 17(5) (input tax credit not claimable)</label>
      </div>

      <h4 className="section-label">List Items</h4>
      <table className="data-table compact">
        <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">GST%</th><th className="num">Amount</th><th></th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td><input className="cell-input" value={i.desc} onChange={(e) => update(i.id, 'desc', e.target.value)} placeholder="Item" /></td>
              <td className="num"><input className="cell-input w60 num" type="number" value={i.qty} onChange={(e) => update(i.id, 'qty', +e.target.value)} /></td>
              <td className="num"><input className="cell-input w90 num" type="number" value={i.rate} onChange={(e) => update(i.id, 'rate', +e.target.value)} /></td>
              <td className="num"><select className="cell-input w80" value={i.gst} onChange={(e) => update(i.id, 'gst', +e.target.value)}>{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</select></td>
              <td className="num">₹{(i.qty * i.rate * (1 + i.gst / 100)).toFixed(2)}</td>
              <td className="num"><button className="row-del" onClick={() => setItems((xs) => xs.filter((x) => x.id !== i.id))}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="modal-itemfoot">
        <button className="btn-ghost" onClick={() => setItems([...items, newItem()])}>+ add item</button>
        <span className="cell-strong">Total: ₹{total.toFixed(2)}</span>
      </div>
      {err && <p className="error">{err}</p>}
    </Modal>
  );
}
