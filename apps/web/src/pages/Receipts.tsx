import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { RecordPaymentModal } from '../components/RecordPaymentModal';

interface Receipt { id: string; date: string; client: string; invoice: string; mode: string; reference?: string | null; amount: number; }
interface Bill { id: string; billNumber: string; outstanding: number; party?: { name: string } | null; status: string; }

const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 });

export function Receipts() {
  const qc = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [payBill, setPayBill] = useState<Bill | null>(null);

  const { data: receipts = [], isLoading } = useQuery({
    queryKey: ['receipts'],
    queryFn: async () => (await api.get<Receipt[]>('/receipts')).data,
  });
  const { data: outstanding = [] } = useQuery({
    queryKey: ['bills', 'outstanding'],
    enabled: pickerOpen,
    queryFn: async () => {
      const bills = (await api.get<Bill[]>('/bills?direction=OUTGOING')).data;
      return bills.filter((b) => b.outstanding > 0.01 && b.status !== 'CANCELLED');
    },
  });

  const total = receipts.reduce((s, r) => s + r.amount, 0);
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['receipts'] }); qc.invalidateQueries({ queryKey: ['bills'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); };

  return (
    <section className="page">
      <div className="page-head">
        <h2>Payment Receipts</h2>
        <div className="page-actions">
          <button className="btn-primary" onClick={() => setPickerOpen(true)}>+ Record Payment</button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card"><div className="stat-label">Total Collected</div><div className="stat-value">{inr(total)}</div></div>
        <div className="stat-card"><div className="stat-label">Payments</div><div className="stat-value">{receipts.length}</div></div>
        <div className="stat-card"><div className="stat-label">Last Payment</div><div className="stat-value">{receipts[0] ? inr(receipts[0].amount) : '—'}</div></div>
      </div>

      <div className="card">
        <table className="data-table">
          <thead><tr><th>Date</th><th>Client</th><th>Invoice No.</th><th>Mode</th><th>Reference</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="muted">Loading…</td></tr>}
            {!isLoading && receipts.length === 0 && <tr><td colSpan={6} className="muted">No payments recorded yet.</td></tr>}
            {receipts.map((r) => (
              <tr key={r.id}>
                <td className="muted">{new Date(r.date).toLocaleDateString('en-IN')}</td>
                <td>{r.client}</td>
                <td>{r.invoice}</td>
                <td className="muted">{r.mode}</td>
                <td className="muted mono">{r.reference ?? '—'}</td>
                <td className="num pos">{inr(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Invoice picker */}
      {pickerOpen && !payBill && (
        <div className="modal-overlay" onClick={() => setPickerOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h3>Select invoice</h3><button className="modal-close" onClick={() => setPickerOpen(false)}>×</button></div>
            <div className="modal-body">
              {outstanding.length === 0 && <p className="muted">No invoices with outstanding balance. 🎉</p>}
              <div className="pick-list">
                {outstanding.map((b) => (
                  <button key={b.id} className="pick-item" onClick={() => { setPayBill(b); setPickerOpen(false); }}>
                    <span className="cell-strong">{b.billNumber}</span>
                    <span className="muted">{b.party?.name ?? '—'}</span>
                    <span className="neg">{inr(b.outstanding)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {payBill && (
        <RecordPaymentModal
          bill={{ id: payBill.id, billNumber: payBill.billNumber, outstanding: payBill.outstanding, partyName: payBill.party?.name }}
          onClose={() => setPayBill(null)}
          onSaved={invalidate}
        />
      )}
    </section>
  );
}
