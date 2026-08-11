import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, currentRole } from '../lib/api';
import { toast } from '../components/Toaster';

interface Supply { key: string; supply: string; audience: string; count: number; taxable: number; tax: number; }
interface Itc { total: number; eligible: number; blocked: number; eligibleCount: number; blockedCount: number; blockedList: { billNumber: string; vendor: string; itc: number }[]; }
interface AuditRow { id: string; action: string; entity: string; entityId: string | null; user: string; email: string | null; ipAddress: string | null; createdAt: string; }

const inr = (n: number) => '₹' + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const dt = (s: string) => new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const ACTION_BADGE: Record<string, string> = { CREATE: 'finalized', EDIT: 'approved', APPROVE: 'verified', DELETE: 'overdue', EXPORT: 'pending', FILE: 'filed' };

/** Access logs / audit trail — append-only, admin-only, CSV-exportable. */
function AuditTrail() {
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const { data: rows = [] } = useQuery({
    queryKey: ['audit', entity, action],
    queryFn: async () => (await api.get<AuditRow[]>(`/audit?limit=200${entity ? `&entity=${entity}` : ''}${action ? `&action=${action}` : ''}`)).data,
  });

  async function exportCsv() {
    try {
      const res = await api.get('/audit/export', { responseType: 'blob' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(res.data);
      a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
      toast('Audit trail exported');
    } catch { toast('Export failed', 'error'); }
  }

  const entities = [...new Set(rows.map((r) => r.entity))];

  return (
    <div className="card">
      <div className="card-head">
        <h3 className="card-title">Access Logs &amp; Audit Trail</h3>
        <button className="btn-ghost" onClick={exportCsv}>Export CSV</button>
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>Append-only record of every action — who did what, when, and from which IP. Immutable at the database level (Sec 128/RBI audit expectations).</p>
      <div className="filter-bar">
        <select value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="">All entities</option>
          {entities.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>
          {['CREATE', 'EDIT', 'APPROVE', 'DELETE', 'EXPORT', 'FILE'].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <table className="data-table compact">
        <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Reference</th><th>IP</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={6} className="muted">No audit entries.</td></tr>}
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="muted">{dt(r.createdAt)}</td>
              <td className="cell-strong">{r.user}{r.email && <span className="muted small"> · {r.email}</span>}</td>
              <td><span className={`badge badge--${ACTION_BADGE[r.action] ?? 'draft'}`}>{r.action}</span></td>
              <td>{r.entity}</td>
              <td className="muted mono">{r.entityId ? r.entityId.slice(0, 8) : '—'}</td>
              <td className="muted mono">{r.ipAddress ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Compliance() {
  const { data: supply = [] } = useQuery({ queryKey: ['supply-classification'], queryFn: async () => (await api.get<Supply[]>('/reports/supply-classification')).data });
  const { data: itc } = useQuery({ queryKey: ['itc-summary'], queryFn: async () => (await api.get<Itc>('/reports/itc-summary')).data });

  return (
    <section className="page">
      <div className="page-head"><h2>Advanced Compliance</h2></div>

      {/* Supply type classification */}
      <div className="card">
        <h3 className="card-title">Supply Type Classification</h3>
        <p className="muted small" style={{ marginTop: 0 }}>Outward supplies auto-classified as intra-state (SPLY) vs inter-state (ISUP), B2B vs B2C — determined from place of supply and counterparty GSTIN.</p>
        <table className="data-table">
          <thead><tr><th>Supply Type</th><th>Audience</th><th className="num">Invoices</th><th className="num">Taxable</th><th className="num">Tax</th></tr></thead>
          <tbody>
            {supply.length === 0 && <tr><td colSpan={5} className="muted">No outward supplies.</td></tr>}
            {supply.map((r) => (
              <tr key={r.key}><td>{r.supply}</td><td>{r.audience}</td><td className="num">{r.count}</td><td className="num">{inr(r.taxable)}</td><td className="num">{inr(r.tax)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ITC eligible vs blocked */}
      <div className="card">
        <h3 className="card-title">Input Tax Credit — Eligible vs Blocked</h3>
        <div className="stat-grid">
          <div className="stat-card"><div className="stat-label">Total ITC (purchases)</div><div className="stat-value">{itc ? inr(itc.total) : '—'}</div></div>
          <div className="stat-card"><div className="stat-label">Eligible ITC</div><div className="stat-value pos">{itc ? inr(itc.eligible) : '—'}</div></div>
          <div className="stat-card"><div className="stat-label">Blocked ITC — Sec 17(5)</div><div className="stat-value neg">{itc ? inr(itc.blocked) : '—'}</div></div>
        </div>
        {itc && itc.blockedList.length > 0 && (
          <table className="data-table" style={{ marginTop: 12 }}>
            <thead><tr><th>Bill No.</th><th>Vendor</th><th className="num">Blocked ITC</th></tr></thead>
            <tbody>
              {itc.blockedList.map((b) => <tr key={b.billNumber}><td className="cell-strong">{b.billNumber}</td><td>{b.vendor}</td><td className="num neg">{inr(b.itc)}</td></tr>)}
            </tbody>
          </table>
        )}
        {itc && itc.blockedList.length === 0 && <p className="muted small">No blocked-ITC purchases. Mark a purchase's ITC as blocked (Sec 17(5)) in the Add Purchase Bill dialog.</p>}
      </div>

      {/* Access logs / audit trail — admin only */}
      {currentRole() === 'ADMIN' && <AuditTrail />}
    </section>
  );
}
