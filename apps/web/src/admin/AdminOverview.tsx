import { useQuery } from '@tanstack/react-query';
import { adminApi } from './adminApi';

interface Overview { tenants: number; active: number; suspended: number; activeSubscriptions: number; plans: number; mrr: number; }
const inr = (n: number) => '₹' + n.toLocaleString('en-IN');

export function AdminOverview() {
  const { data } = useQuery({ queryKey: ['admin-overview'], queryFn: async () => (await adminApi.get<Overview>('/overview')).data });
  const tiles = [
    ['Tenants', data?.tenants], ['Active', data?.active], ['Suspended', data?.suspended],
    ['Active Licenses', data?.activeSubscriptions], ['Plans', data?.plans], ['MRR (est.)', data ? inr(data.mrr) : undefined],
  ] as const;
  return (
    <section className="page">
      <div className="page-head"><h2>Platform Overview</h2></div>
      <div className="quick-grid">
        {tiles.map(([label, value]) => (
          <div key={label} className="quick"><span className="quick-num">{value ?? '—'}</span><span className="quick-lbl">{label}</span></div>
        ))}
      </div>
      <div className="card">
        <h3 className="card-title">Master console</h3>
        <p className="muted">Manage tenant licenses (suspend / extend), subscription plans &amp; pricing, and platform-wide GST API credentials from the sections on the left. Suspending a tenant blocks all its user logins immediately; expired licenses are blocked automatically.</p>
      </div>
    </section>
  );
}
