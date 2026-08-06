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
  recentOrders: { id: string; product: string; category: string; price: number; status: string }[];
}
const inrK = (n: number) => '₹' + n.toLocaleString('en-IN');

const sales = [120, 200, 95, 150, 80, 60, 140, 70, 110, 205, 130, 75];
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function BarChart() {
  const max = 400, W = 560, H = 230, pad = 28;
  const bw = (W - pad) / sales.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="barchart">
      {[0, 100, 200, 300, 400].map((g) => {
        const y = H - 20 - (g / max) * (H - 40);
        return (
          <g key={g}>
            <line x1={pad} x2={W} y1={y} y2={y} stroke="var(--color-divider)" />
            <text x={0} y={y + 4} className="axis">{g}</text>
          </g>
        );
      })}
      {sales.map((v, i) => {
        const bh = (v / max) * (H - 40);
        const x = pad + i * bw + bw * 0.25;
        return (
          <g key={i}>
            <rect x={x} y={H - 20 - bh} width={bw * 0.5} height={bh} rx="3" fill="var(--color-primary)" />
            <text x={x + bw * 0.25} y={H - 6} className="axis" textAnchor="middle">{months[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Gauge({ pct = 75.55 }: { pct?: number }) {
  const r = 80, cx = 100, cy = 100;
  const a = Math.PI * (1 - pct / 100);
  const x = cx + r * Math.cos(a), y = cy - r * Math.sin(a);
  return (
    <svg viewBox="0 0 200 120" className="gauge">
      <path d={`M20 100 A80 80 0 0 1 180 100`} fill="none" stroke="var(--color-divider)" strokeWidth="14" strokeLinecap="round" />
      <path d={`M20 100 A80 80 0 0 1 ${x} ${y}`} fill="none" stroke="var(--color-primary)" strokeWidth="14" strokeLinecap="round" />
      <text x="100" y="92" textAnchor="middle" className="gauge-val">{pct}%</text>
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
        <StatCard icon={<IconClients size={20} />} label="Customers" value={data ? String(data.customers) : '—'} delta="11.01%" up />
        <StatCard icon={<IconPurchases size={20} />} label="Orders" value={data ? String(data.orders) : '—'} delta="9.05%" up={false} />
        <StatCard icon={<IconReports size={20} />} label="Net Profit" value={data ? inrK(data.netProfit) : '—'} delta="9.05%" up />
      </div>

      <div className="dash-row">
        <div className="card">
          <h3 className="card-title">Monthly Sales</h3>
          <BarChart />
        </div>
        <div className="card">
          <h3 className="card-title">Monthly Target</h3>
          <p className="muted small">Target you've set for each month</p>
          <Gauge />
          <p className="center small">You earn $3287 today, it's higher than last month.<br />Keep up your good work!</p>
          <div className="target-footer">
            <div><span className="muted small">Target</span><b>$20K ↓</b></div>
            <div><span className="muted small">Revenue</span><b>$20K ↑</b></div>
            <div><span className="muted small">Today</span><b>$20K ↑</b></div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Recent Orders</h3>
          <div className="card-actions">
            <button className="btn-ghost">Import CSV File</button>
            <button className="btn-ghost">Filter</button>
            <button className="btn-ghost">See all</button>
          </div>
        </div>
        <table className="data-table">
          <thead><tr><th>Products</th><th>Category</th><th>Price</th><th>Status</th></tr></thead>
          <tbody>
            {orders.length === 0 && <tr><td colSpan={4} className="muted">No orders yet.</td></tr>}
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.product}</td><td className="muted">{o.category}</td><td>{inrK(o.price)}</td>
                <td><span className={`badge badge--${o.status.toLowerCase()}`}>{o.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
