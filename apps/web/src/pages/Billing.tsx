import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from '../components/Toaster';

interface Plan { id: string; name: string; interval: 'MONTHLY' | 'QUARTERLY' | 'YEARLY'; priceInr: string; limits?: any; features?: any; trialDays: number; }
interface Subscription { planId: string; status: string; currentPeriodEnd?: string | null; autoRenew: boolean; plan?: { name: string } }

const inr = (n: number) => '₹' + n.toLocaleString('en-IN');
const per = (i: Plan['interval']) => (i === 'YEARLY' ? '/year' : i === 'QUARTERLY' ? '/quarter' : '/month');
const d = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

/** Feature bullets shown on a pricing card, derived from the plan's limits. */
function featuresFor(p: Plan): string[] {
  const l = p.limits ?? {};
  const bills = l.bills === -1 ? 'Unlimited invoices' : `${Number(l.bills ?? 0).toLocaleString('en-IN')} invoices / month`;
  const users = l.users === -1 ? 'Unlimited team members' : `${l.users ?? 1} team members`;
  const base = [bills, users, 'GST returns — GSTR-1 / 3B / 4', 'E-Way Bill & e-Invoice (GSP)'];
  base.push(p.priceInr && Number(p.priceInr) >= 2000 ? 'Priority support' : 'Email support');
  return base;
}

function PlanCard({ plan, highlight, current, onChoose }: { plan: Plan; highlight: boolean; current: boolean; onChoose: (p: Plan) => void }) {
  return (
    <div className={`price-card ${highlight ? 'price-card--hi' : ''}`}>
      <div className="price-tag">PROFESSIONAL</div>
      <div className="price-head">
        <span className="price-name">{plan.name}</span>
        <span className="price-per">{inr(Number(plan.priceInr))} {per(plan.interval)}</span>
      </div>
      <ul className="price-feats">
        {featuresFor(plan).map((f) => <li key={f}><span className="price-star">★</span>{f}</li>)}
      </ul>
      <div className="price-foot">
        {current
          ? <button className="price-cta price-cta--current" disabled>Current plan</button>
          : <button className="price-cta" onClick={() => onChoose(plan)}>Get Started</button>}
      </div>
    </div>
  );
}

export function Billing() {
  const [tab, setTab] = useState<'PLANS' | 'AUTOPAY'>('PLANS');
  const { data: plans = [] } = useQuery({ queryKey: ['billing-plans'], queryFn: async () => (await api.get<Plan[]>('/billing/plans')).data });
  const { data: sub } = useQuery({ queryKey: ['billing-subscription'], queryFn: async () => (await api.get<Subscription>('/billing/subscription')).data });

  // Highlight the mid-tier (recommended) card.
  const hiIndex = plans.length >= 3 ? 1 : plans.length - 1;

  async function choose(p: Plan) {
    try {
      const { data } = await api.post('/billing/request-change', { planId: p.id });
      toast(data.message ?? `Requested ${p.name}`, 'success');
    } catch (e: any) {
      toast(e?.response?.data?.message ?? 'Could not send request', 'error');
    }
  }

  return (
    <section className="page">
      <div className="page-head"><h2>Plans &amp; Billing</h2></div>

      <div className="tabs">
        <button className={`tab ${tab === 'PLANS' ? 'tab--active' : ''}`} onClick={() => setTab('PLANS')}>Plans</button>
        <button className={`tab ${tab === 'AUTOPAY' ? 'tab--active' : ''}`} onClick={() => setTab('AUTOPAY')}>Auto Pay</button>
      </div>

      {tab === 'PLANS' && (
        <>
          <div className="pricing-label">PRICING DETAILS</div>
          <div className="price-grid">
            {plans.map((p, i) => (
              <PlanCard key={p.id} plan={p} highlight={i === hiIndex} current={sub?.planId === p.id} onChoose={choose} />
            ))}
            {plans.length === 0 && <p className="muted">No plans available.</p>}
          </div>
          <p className="muted small">
            Changing plans sends a request to your account manager — activation and payment are handled by the DONICY
            team (self-serve checkout is coming soon).
          </p>
        </>
      )}

      {tab === 'AUTOPAY' && (
        <div className="card" style={{ maxWidth: 520 }}>
          <h3 className="card-title">Current Subscription</h3>
          <div className="kv-row"><span className="muted">Plan</span><b>{sub?.plan?.name ?? '—'}</b></div>
          <div className="kv-row"><span className="muted">Status</span><span className={`badge badge--${(sub?.status ?? 'pending').toLowerCase() === 'active' ? 'finalized' : 'pending'}`}>{sub?.status ?? '—'}</span></div>
          <div className="kv-row"><span className="muted">Renews on</span><b>{d(sub?.currentPeriodEnd)}</b></div>
          <div className="kv-row"><span className="muted">Auto-renew</span><b>{sub?.autoRenew ? 'On' : 'Off'}</b></div>
          <p className="muted small" style={{ marginTop: 12 }}>Auto-pay via card/UPI mandate activates once the payment gateway is connected.</p>
        </div>
      )}
    </section>
  );
}
