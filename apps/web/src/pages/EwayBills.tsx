import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Modal } from '../components/Modal';
import { toast } from '../components/Toaster';

interface Row {
  id: string; billNumber: string; billDate: string; party: string; grandTotal: number;
  required: boolean; ewbNo: string | null; ewbStatus: string | null; validUpto: string | null; vehicleNo: string | null;
}
const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 });
const d = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-IN') : '—');

export function EwayBills() {
  const qc = useQueryClient();
  const [gen, setGen] = useState<Row | null>(null);
  const [vehicleNo, setVehicleNo] = useState('');
  const [transporterId, setTransporterId] = useState('');

  const { data: rows = [], isLoading } = useQuery({ queryKey: ['eway'], queryFn: async () => (await api.get<Row[]>('/eway')).data });

  const generate = useMutation({
    mutationFn: async () => (await api.post(`/eway/${gen!.id}/generate`, { vehicleNo: vehicleNo || undefined, transporterId: transporterId || undefined })).data,
    onSuccess: (e: any) => { qc.invalidateQueries({ queryKey: ['eway'] }); toast(`e-Way Bill ${e.ewbNo} generated`); setGen(null); setVehicleNo(''); setTransporterId(''); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Failed', 'error'),
  });

  return (
    <section className="page">
      <div className="page-head"><h2>E-Way Bills</h2></div>
      <div className="card">
        <p className="muted small" style={{ marginTop: 0 }}>e-Way Bill is required for consignments over ₹50,000. Generate against a sales invoice; add the vehicle number for Part-B.</p>
        <table className="data-table">
          <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th className="num">Value</th><th>EWB No.</th><th>Valid Upto</th><th>Vehicle</th><th>Actions</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="muted">Loading…</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={8} className="muted">No sales invoices yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="cell-strong">{r.billNumber}</td>
                <td className="muted">{d(r.billDate)}</td>
                <td>{r.party}</td>
                <td className="num">{inr(r.grandTotal)} {r.required && !r.ewbNo && <span className="badge badge--pending">EWB due</span>}</td>
                <td className="mono">{r.ewbNo ?? '—'}</td>
                <td className="muted">{d(r.validUpto)}</td>
                <td className="muted">{r.vehicleNo ?? '—'}</td>
                <td className="actions">
                  {r.ewbNo
                    ? <span className="badge badge--finalized">{r.ewbStatus}</span>
                    : <button className="link-btn" onClick={() => { setGen(r); setVehicleNo(''); setTransporterId(''); }}>Generate EWB</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {gen && (
        <Modal
          title={`Generate e-Way Bill — ${gen.billNumber}`}
          onClose={() => setGen(null)}
          footer={<>
            <button className="btn-ghost" onClick={() => setGen(null)}>Cancel</button>
            <button className="btn-primary" disabled={generate.isPending} onClick={() => generate.mutate()}>{generate.isPending ? 'Generating…' : 'Generate'}</button>
          </>}
        >
          <p className="muted small" style={{ marginTop: 0 }}>{gen.party} · {inr(gen.grandTotal)}</p>
          <div className="form-grid">
            <label>Vehicle No.<input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} placeholder="MH12AB1234" /></label>
            <label>Transporter ID<input value={transporterId} onChange={(e) => setTransporterId(e.target.value)} placeholder="Optional" /></label>
          </div>
          <p className="muted small">Uses the NIC e-Way Bill API when sandbox/production credentials are configured in the master admin panel; otherwise issues a local reference number.</p>
        </Modal>
      )}
    </section>
  );
}
