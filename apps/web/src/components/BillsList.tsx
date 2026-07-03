import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { IconSearch } from './icons';

interface Bill {
  id: string; billNumber: string; direction: string; documentType: string; status: string;
  billDate: string; grandTotal: string; party?: { name: string } | null;
}
const STATUSES = ['', 'DRAFT', 'APPROVED', 'VERIFIED', 'FINALIZED', 'CANCELLED'];
// Allowed next states mirror the backend transition map.
const NEXT: Record<string, string[]> = {
  DRAFT: ['APPROVED', 'CANCELLED'], APPROVED: ['VERIFIED', 'DRAFT', 'CANCELLED'],
  VERIFIED: ['FINALIZED', 'APPROVED', 'CANCELLED'], FINALIZED: [], CANCELLED: [],
};
const inr = (n: string) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });

export function BillsList({ direction, title, newLabel, onNew }: { direction: 'OUTGOING' | 'INCOMING'; title: string; newLabel: string; onNew?: () => void }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const { data: bills = [], isLoading } = useQuery({
    queryKey: ['bills', direction, status, search],
    queryFn: async () => (await api.get<Bill[]>('/bills', { params: { direction, status: status || undefined, search: search || undefined } })).data,
  });

  const setStatusM = useMutation({
    mutationFn: async ({ id, s }: { id: string; s: string }) => (await api.patch(`/bills/${id}/status`, { status: s })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bills'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); },
  });
  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/bills/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bills'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); },
  });

  async function openPdf(id: string) {
    const res = await api.get(`/bills/${id}/invoice.pdf`, { responseType: 'blob' });
    window.open(URL.createObjectURL(res.data), '_blank');
  }
  async function email(id: string) {
    const r = await api.post(`/bills/${id}/email`, {});
    alert(r.data?.sent ? 'Invoice emailed.' : `Not sent: ${r.data?.reason ?? 'unknown'}`);
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
          <thead><tr><th>Bill No.</th><th>Date</th><th>{direction === 'OUTGOING' ? 'Customer' : 'Vendor'}</th><th className="num">Total</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="muted">Loading…</td></tr>}
            {!isLoading && bills.length === 0 && <tr><td colSpan={6} className="muted">No bills yet.</td></tr>}
            {bills.map((b) => (
              <tr key={b.id}>
                <td className="cell-strong">{b.billNumber}</td>
                <td className="muted">{new Date(b.billDate).toLocaleDateString('en-IN')}</td>
                <td>{b.party?.name ?? '—'}</td>
                <td className="num">{inr(b.grandTotal)}</td>
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
                  <button className="link-btn" onClick={() => openPdf(b.id)}>PDF</button>
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
    </section>
  );
}
