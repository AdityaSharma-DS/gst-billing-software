import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from '../components/Toaster';

interface Row {
  id: string; billNumber: string; billDate: string; party: string; gstin: string | null; grandTotal: number;
  status: string; eligible: boolean; irn: string | null; ackNo: string | null; ackDate: string | null;
  irnStatus: string | null; hasQr: boolean;
}
const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 });
const d = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-IN') : '—');

export function EInvoices() {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data: rows = [], isLoading } = useQuery({ queryKey: ['einvoice'], queryFn: async () => (await api.get<Row[]>('/einvoice')).data });

  const generate = useMutation({
    mutationFn: async (id: string) => (await api.post(`/einvoice/${id}/generate`, {})).data,
    onSuccess: (r: any) => { qc.invalidateQueries({ queryKey: ['einvoice'] }); toast(`IRN generated${r.source === 'PLACEHOLDER' ? ' (local reference — configure the GSP for a real IRN)' : ''}`); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'IRN generation failed', 'error'),
    onSettled: () => setBusyId(null),
  });

  return (
    <section className="page">
      <div className="page-head"><h2>E-Invoices (IRN)</h2></div>
      <div className="card">
        <p className="muted small" style={{ marginTop: 0 }}>
          e-Invoicing generates a government IRN (Invoice Reference Number) and signed QR for <b>B2B</b> sales invoices
          (the customer must have a GSTIN). Finalize the invoice, then generate its IRN.
        </p>
        <table className="data-table">
          <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>GSTIN</th><th className="num">Value</th><th>IRN</th><th>Ack No.</th><th>Actions</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="muted">Loading…</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={8} className="muted">No sales invoices yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="cell-strong">{r.billNumber}</td>
                <td className="muted">{d(r.billDate)}</td>
                <td>{r.party}</td>
                <td className="mono muted">{r.gstin ?? <span className="badge badge--pending">B2C</span>}</td>
                <td className="num">{inr(r.grandTotal)}</td>
                <td className="mono" title={r.irn ?? ''}>{r.irn ? `${r.irn.slice(0, 12)}…` : '—'}</td>
                <td className="muted mono">{r.ackNo ?? '—'}</td>
                <td className="actions">
                  {r.irn
                    ? <span className="badge badge--finalized">{r.irnStatus}{r.hasQr ? ' · QR' : ''}</span>
                    : r.eligible
                      ? <button className="link-btn" disabled={busyId === r.id} onClick={() => { setBusyId(r.id); generate.mutate(r.id); }}>{busyId === r.id ? 'Generating…' : 'Generate IRN'}</button>
                      : <span className="muted small" title={!r.gstin ? 'Customer has no GSTIN (B2C)' : 'Finalize the invoice first'}>{!r.gstin ? 'B2C — n/a' : 'Finalize first'}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small" style={{ marginTop: 8 }}>
          Uses the NIC e-Invoice API when sandbox/production credentials are configured in the master admin panel; otherwise issues a local reference IRN so the workflow stays testable.
        </p>
      </div>
    </section>
  );
}
