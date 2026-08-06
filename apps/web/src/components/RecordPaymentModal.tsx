import { useState } from 'react';
import { api } from '../lib/api';
import { Modal } from './Modal';
import { toast } from './Toaster';

const MODES = ['UPI', 'Cash', 'Bank Transfer', 'Card', 'Cheque'];
const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 });

export function RecordPaymentModal({ bill, onClose, onSaved }: {
  bill: { id: string; billNumber: string; outstanding: number; partyName?: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(bill.outstanding);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState('UPI');
  const [reference, setReference] = useState('');
  const [chequeNo, setChequeNo] = useState('');
  const [bankDetails, setBankDetails] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const showCheque = mode === 'Cheque';
  const showBank = mode === 'Bank Transfer' || mode === 'Cheque';

  async function save() {
    setErr(''); setSaving(true);
    try {
      const { data } = await api.post(`/bills/${bill.id}/payments`, {
        amount, mode, reference: reference || undefined,
        chequeNo: showCheque ? (chequeNo || undefined) : undefined,
        bankDetails: showBank ? (bankDetails || undefined) : undefined,
        date: new Date(date).toISOString(),
      });
      toast(`Payment of ${inr(amount)} recorded — ${data.paymentStatus === 'PAID' ? 'fully paid' : `${inr(data.outstanding)} outstanding`}`);
      onSaved(); onClose();
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Could not record payment.');
    } finally { setSaving(false); }
  }

  return (
    <Modal
      title={`Record Payment — ${bill.billNumber}`}
      onClose={onClose}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={saving || amount <= 0} onClick={save}>{saving ? 'Saving…' : 'Record Payment'}</button>
      </>}
    >
      {bill.partyName && <p className="muted small" style={{ marginTop: 0 }}>{bill.partyName} · Outstanding: <b className="neg">{inr(bill.outstanding)}</b></p>}
      <div className="form-grid">
        <label>Amount (₹)<input type="number" autoFocus value={amount} max={bill.outstanding} onChange={(e) => setAmount(+e.target.value)} /></label>
        <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Mode<select value={mode} onChange={(e) => setMode(e.target.value)}>{MODES.map((m) => <option key={m}>{m}</option>)}</select></label>
        <label>Reference / UTR<input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" /></label>
        {showCheque && <label>Cheque No.<input value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} placeholder="Cheque number" /></label>}
        {showBank && <label className={showCheque ? '' : 'span2'}>Bank / Branch Details<input value={bankDetails} onChange={(e) => setBankDetails(e.target.value)} placeholder="Bank, branch, account" /></label>}
      </div>
      {amount > bill.outstanding && <p className="warn-item">⚠ Amount exceeds outstanding {inr(bill.outstanding)}.</p>}
      {err && <p className="error">{err}</p>}
    </Modal>
  );
}
