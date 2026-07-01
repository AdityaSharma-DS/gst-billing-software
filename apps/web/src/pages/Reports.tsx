import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Pnl {
  totalRevenue: number; gstCollected: number; netRevenue: number;
  totalExpenses: number; itc: number; netExpenses: number; netProfit: number; gstPayable: number;
}
interface Receivable { date: string; invoice: string; client: string; amount: number; paid: number; outstanding: number; }

const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const d = (s: string) => new Date(s).toLocaleDateString('en-IN');

export function Reports() {
  const { data: pnl } = useQuery({ queryKey: ['pnl'], queryFn: async () => (await api.get<Pnl>('/reports/pnl')).data });
  const { data: recv = [] } = useQuery({ queryKey: ['receivables'], queryFn: async () => (await api.get<Receivable[]>('/reports/receivables')).data });

  const rows = pnl ? [
    { label: 'Total Revenue', value: pnl.totalRevenue },
    { label: 'Less: GST Collected', value: pnl.gstCollected, sub: true },
    { label: 'Net Revenue', value: pnl.netRevenue, strong: true },
    { label: 'Total Expenses', value: pnl.totalExpenses },
    { label: 'Less: GST on Expenses (ITC)', value: pnl.itc, sub: true },
    { label: 'Net Expenses', value: pnl.netExpenses, strong: true },
    { label: 'Net Profit', value: pnl.netProfit, profit: true },
  ] : [];

  return (
    <section className="page">
      <div className="page-head">
        <h2>Reports</h2>
        <div className="page-actions"><button className="btn-ghost">FY 2026-27</button><button className="btn-ghost">Export</button></div>
      </div>

      <div className="stat-grid stat-grid--4">
        <div className="stat-card"><div className="stat-label">Revenue</div><div className="stat-value">{pnl ? inr(pnl.totalRevenue) : '—'}</div></div>
        <div className="stat-card"><div className="stat-label">Expenses</div><div className="stat-value">{pnl ? inr(pnl.totalExpenses) : '—'}</div></div>
        <div className="stat-card"><div className="stat-label">Net Profit</div><div className="stat-value">{pnl ? inr(pnl.netProfit) : '—'}</div></div>
        <div className="stat-card"><div className="stat-label">GST Payable</div><div className="stat-value">{pnl ? inr(pnl.gstPayable) : '—'}</div></div>
      </div>

      <div className="card">
        <h3 className="card-title">Profit &amp; Loss Statement</h3>
        <div className="pnl">
          {rows.map((r) => (
            <div key={r.label} className={`pnl-row ${r.strong ? 'pnl-strong' : ''} ${r.profit ? 'pnl-profit' : ''}`}>
              <span className={r.sub ? 'muted' : ''}>{r.label}</span>
              <span>{inr(r.value)}</span>
            </div>
          ))}
          {!pnl && <p className="muted">Loading…</p>}
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Outstanding Receivables</h3>
        <table className="data-table">
          <thead><tr><th>Date</th><th>Invoice No.</th><th>Client</th><th className="num">Amount</th><th className="num">Paid</th><th className="num">Outstanding</th></tr></thead>
          <tbody>
            {recv.length === 0 && <tr><td colSpan={6} className="muted">No receivables.</td></tr>}
            {recv.map((r) => (
              <tr key={r.invoice}>
                <td className="muted">{d(r.date)}</td><td>{r.invoice}</td><td>{r.client}</td>
                <td className="num">{inr(r.amount)}</td><td className="num pos">{inr(r.paid)}</td>
                <td className="num"><span className={r.outstanding ? 'neg' : 'muted'}>{inr(r.outstanding)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
