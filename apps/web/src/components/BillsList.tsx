import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { IconSearch } from './icons';
import { RecordPaymentModal } from './RecordPaymentModal';
import { toast } from './Toaster';

interface Bill {
  id: string; billNumber: string; direction: string; documentType: string; status: string;
  billDate: string; grandTotal: string; paid: number; outstanding: number; paymentStatus: string;
  party?: { name: string } | null;
}
const STATUSES = ['', 'DRAFT', 'APPROVED', 'VERIFIED', 'FINALIZED', 'CANCELLED'];
// Allowed next states mirror the backend transition map.
const NEXT: Record<string, string[]> = {
  DRAFT: ['APPROVED', 'CANCELLED'], APPROVED: ['VERIFIED', 'DRAFT', 'CANCELLED'],
  VERIFIED: ['FINALIZED', 'APPROVED', 'CANCELLED'], FINALIZED: [], CANCELLED: [],
};
const inr = (n: number | string) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });

export function BillsList({ direction, title, newLabel, onNew }: { direction: 'OUTGOING' | 'INCOMING'; title: string; newLabel: string; onNew?: () => void }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [payBill, setPayBill] = useState<Bill | null>(null);

  const { data: bills = [], isLoading } = useQuery({
    queryKey: ['bills', direction, status, search],
    queryFn: async () => (await api.get<Bill[]>('/bills', { params: { direction, status: status || undefined, search: search || undefined } })).data,
  });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['bills'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); qc.invalidateQueries({ queryKey: ['receipts'] }); };

  const setStatusM = useMutation({
    mutationFn: async ({ id, s }: { id: string; s: string }) => (await api.patch(`/bills/${id}/status`, { status: s })).data,
    onSuccess: (b: any) => { invalidate(); toast(`${b.billNumber} → ${b.status}`); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Status change failed', 'error'),
  });
  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/bills/${id}`)).data,
    onSuccess: () => { invalidate(); toast('Bill deleted'); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Delete failed', 'error'),
  });

  /** Open the PDF via a named URL so the tab & viewer-download show INV-xxxxx.pdf. */
  function openPdf(b: Bill) {
    const token = localStorage.getItem('accessToken');
    window.open(`/api/bills/${b.id}/pdf/${b.billNumber}.pdf?token=${token}`, '_blank');
  }
  /** Download with a proper filename (INV-00004.pdf) instead of a blob hash. */
  async function downloadPdf(b: Bill) {
    const res = await api.get(`/bills/${b.id}/invoice.pdf`, { responseType: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(res.data);
    a.download = `${b.billNumber}.pdf`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`${b.billNumber}.pdf downloaded (also archived on server)`);
  }
  async function sendWhatsapp(b: Bill) {
    try {
      const { data } = await api.post(`/bills/${b.id}/whatsapp`, {});
      if (data.apiSent) toast(`WhatsApp sent to ${data.to} (${data.status})`);
      else toast(data.reason ?? 'Opening WhatsApp share…', 'info');
      if (data.waLink) window.open(data.waLink, '_blank');
    } catch { toast('WhatsApp send failed', 'error'); }
  }
  async function email(id: string) {
    try {
      const r = await api.post(`/bills/${id}/email`, {});
      r.data?.sent ? toast('Invoice emailed') : toast(`Not sent: ${r.data?.reason ?? 'unknown'}`, 'error');
    } catch { toast('Email failed', 'error'); }
  }

  return (
    <section className="page">
      <div className="page-head">
        <h2>{title}</h2>
        <div className="page-actions">
          <button className="btn-ghost" onClick={() => nav(`${direction === 'OUTGOING' ? '/invoices' : '/purchases'}/import`)}>Import CSV</button>
          <button className="btn-primary" onClick={() => (onNew ? onNew() : nav(`${direction === 'OUTGOING' ? '/invoices' : '/purchases'}/new`))}>+ {newLabel}</button>
        </div>
      </div>

      <div className="card">
        <div className="filter-bar">
          <div className="searchbox searchbox--inline"><IconSearch size={18} /><input placeholder="Search bill no. / party" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
          </select>
        </div>

        <table className="data-table">
          <thead><tr><th>Bill No.</th><th>Date</th><th>{direction === 'OUTGOING' ? 'Customer' : 'Vendor'}</th><th className="num">Total</th><th className="num">Outstanding</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="muted">Loading…</td></tr>}
            {!isLoading && bills.length === 0 && <tr><td colSpan={7} className="muted">No bills yet.</td></tr>}
            {bills.map((b) => (
              <tr key={b.id}>
                <td className="cell-strong">{b.billNumber}</td>
                <td className="muted">{new Date(b.billDate).toLocaleDateString('en-IN')}</td>
                <td>{b.party?.name ?? '—'}</td>
                <td className="num">{inr(b.grandTotal)}</td>
                <td className="num">
                  {b.outstanding > 0.01
                    ? <span className="neg">{inr(b.outstanding)}</span>
                    : <span className="badge badge--finalized">Paid</span>}
                </td>
                <td>
                  <span className={`badge badge--${b.status.toLowerCase()}`}>{b.status}</span>
                  {NEXT[b.status]?.length > 0 && (
                    <select className="status-select" value="" onChange={(e) => e.target.value && setStatusM.mutate({ id: b.id, s: e.target.value })}>
                      <option value="">→</option>
                      {NEXT[b.status].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                </td>
                <td className="actions">
                  {b.outstanding > 0.01 && b.status !== 'CANCELLED' && (
                    <button className="link-btn" onClick={() => setPayBill(b)}>Record Payment</button>
                  )}
                  <button className="link-btn" onClick={() => openPdf(b)}>PDF</button>
                  <button className="link-btn" onClick={() => downloadPdf(b)}>Download</button>
                  {direction === 'OUTGOING' && <button className="link-btn wa" onClick={() => sendWhatsapp(b)}>WhatsApp</button>}
                  <button className="link-btn" onClick={() => email(b.id)}>Email</button>
                  {!['FINALIZED', 'CANCELLED'].includes(b.status) && (
                    <button className="link-btn" onClick={() => nav(`${direction === 'OUTGOING' ? '/invoices' : '/purchases'}/${b.id}/edit`)}>Edit</button>
                  )}
                  {b.status !== 'FINALIZED' && (
                    <button className="link-btn danger" onClick={() => confirm(`Delete ${b.billNumber}?`) && del.mutate(b.id)}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
