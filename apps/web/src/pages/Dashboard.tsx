import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { StatCard } from '../components/StatCard';
import { IconClients, IconPurchases, IconReports, IconSearch } from '../components/icons';

interface Summary {
  customers: number; orders: number; revenue: number; netProfit: number;
  incomingValue: number; outgoingValue: number;
  billsToday: number; billsThisWeek: number; billsThisMonth: number; pendingApprovals: number;
  monthlySales: { month: string; total: number }[];
  recentOrders: { id: string; product: string; category: string; price: number; status: string }[];
}
const inrK = (n: number) => '₹' + n.toLocaleString('en-IN');
const inrShort = (n: number) => (n >= 1e7 ? '₹' + (n / 1e7).toFixed(1) + 'Cr' : n >= 1e5 ? '₹' + (n / 1e5).toFixed(1) + 'L' : n >= 1e3 ? '₹' + Math.round(n / 1e3) + 'k' : '₹' + Math.round(n));

/** Real last-12-months outward sales. */
function BarChart({ data }: { data: { month: string; total: number }[] }) {
  const W = 680, H = 240, pad = 44, base = H - 24;
  const max = Math.max(1, ...data.map((d) => d.total));
  const bw = (W - pad) / (data.length || 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="barchart">
      {[0, 0.5, 1].map((f) => {
        const y = base - f * (base - 16);
        return (
          <g key={f}>
            <line x1={pad} x2={W} y1={y} y2={y} stroke="var(--color-divider)" />
            <text x={0} y={y + 4} className="axis">{inrShort(max * f)}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const bh = (d.total / max) * (base - 16);
        const x = pad + i * bw + bw * 0.25;
        return (
          <g key={i}>
            <rect x={x} y={base - bh} width={bw * 0.5} height={Math.max(0, bh)} rx="3" fill="var(--color-primary)" />
            <text x={x + bw * 0.25} y={base + 14} className="axis" textAnchor="middle">{d.month}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function Dashboard() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<Summary>('/dashboard/summary')).data,
  });
  const orders = data?.recentOrders ?? [];
  const monthly = data?.monthlySales ?? [];
  const hasSales = monthly.some((m) => m.total > 0);

  return (
    <section className="page">
      {/* Quick bill search */}
      <form className="searchbox searchbox--wide" onSubmit={(e) => { e.preventDefault(); nav(`/invoices?q=${encodeURIComponent(q)}`); }}>
        <IconSearch size={18} />
        <input placeholder="Quick bill search — number or party…" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>

      {/* Quick dashboard counts — click any tile to open the filtered list */}
      <div className="quick-grid">
        <button className="quick" onClick={() => nav('/invoices')}><span className="quick-num">{data?.billsToday ?? '—'}</span><span className="quick-lbl">Bills today</span></button>
        <button className="quick" onClick={() => nav('/invoices')}><span className="quick-num">{data?.billsThisWeek ?? '—'}</span><span className="quick-lbl">This week</span></button>
        <button className="quick" onClick={() => nav('/invoices')}><span className="quick-num">{data?.billsThisMonth ?? '—'}</span><span className="quick-lbl">This month</span></button>
        <button className="quick" onClick={() => nav('/invoices')}><span className="quick-num">{data ? inrK(data.outgoingValue) : '—'}</span><span className="quick-lbl">Outgoing supply</span></button>
        <button className="quick" onClick={() => nav('/purchases')}><span className="quick-num">{data ? inrK(data.incomingValue) : '—'}</span><span className="quick-lbl">Incoming supply</span></button>
        <button className="quick" onClick={() => nav('/invoices?status=DRAFT')}><span className="quick-num warn">{data?.pendingApprovals ?? '—'}</span><span className="quick-lbl">Pending approvals</span></button>
      </div>

      <div className="stat-grid">
        <StatCard icon={<IconClients size={20} />} label="Customers" value={data ? String(data.customers) : '—'} />
        <StatCard icon={<IconPurchases size={20} />} label="Invoices" value={data ? String(data.orders) : '—'} />
        <StatCard icon={<IconReports size={20} />} label="Net Profit" value={data ? inrK(data.netProfit) : '—'} />
      </div>

      <div className="card">
        <h3 className="card-title">Monthly Sales</h3>
        {hasSales
          ? <BarChart data={monthly} />
          : <p className="muted small" style={{ padding: '28px 0' }}>No sales in the last 12 months yet. Create an invoice and it’ll show up here.</p>}
      </div>

      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Recent Invoices</h3>
          <div className="card-actions">
            <button className="btn-ghost" onClick={() => nav('/invoices/import')}>Import CSV</button>
            <button className="btn-ghost" onClick={() => nav('/invoices')}>See all</button>
          </div>
        </div>
        <table className="data-table">
          <thead><tr><th>Party</th><th>Type</th><th className="num">Amount</th><th>Status</th></tr></thead>
          <tbody>
            {orders.length === 0 && <tr><td colSpan={4} className="muted">No invoices yet.</td></tr>}
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="cell-strong">{o.product}</td><td className="muted">{o.category}</td><td className="num">{inrK(o.price)}</td>
                <td><span className={`badge badge--${o.status.toLowerCase()}`}>{o.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
