import { NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, logout } from '../lib/api';
import { Logo } from './Logo';
import { NotificationsBell } from './NotificationsBell';
import {
  IconDashboard, IconClients, IconPlus, IconRecurring, IconExpenses,
  IconPurchases, IconReceipts, IconReports, IconReturns, IconSettings,
  IconSearch, IconBox,
} from './icons';

const nav = [
  { to: '/dashboard', label: 'Dashboard', Icon: IconDashboard },
  { to: '/clients', label: 'Clients', Icon: IconClients },
  { to: '/vendors', label: 'Vendors', Icon: IconClients },
  { to: '/inventory', label: 'Inventory', Icon: IconBox },
  { to: '/invoices', label: 'New Invoices', Icon: IconPlus },
  { to: '/recurring', label: 'Recurring Clients', Icon: IconRecurring },
  { to: '/expenses', label: 'Expenses', Icon: IconExpenses },
  { to: '/purchases', label: 'Purchases', Icon: IconPurchases },
  { to: '/receipts', label: 'Receipts', Icon: IconReceipts },
  { to: '/reports', label: 'Reports', Icon: IconReports },
  { to: '/eway', label: 'E-Way Bills', Icon: IconReturns },
  { to: '/returns', label: 'GST Returns', Icon: IconReturns },
  { to: '/compliance', label: 'Compliance', Icon: IconReports },
];

interface Sub { plan?: { name: string }; currentPeriodEnd?: string | null; status?: string }

function PlanCard() {
  const { data: sub } = useQuery({
    queryKey: ['billing-subscription'],
    queryFn: async () => (await api.get<Sub>('/billing/subscription')).data,
    retry: false,
  });
  const planName = sub?.plan?.name ?? 'Free plan';
  const end = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const daysLeft = end ? Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86_400_000)) : null;
  // Progress bar: fraction of a ~365-day licence still remaining (visual only).
  const pct = daysLeft != null ? Math.max(6, Math.min(100, (daysLeft / 365) * 100)) : 55;
  return (
    <NavLink to="/billing" className="plan-card" aria-label="Plans and billing">
      <div className="plan-card-top">
        <span className="plan-tile" aria-hidden />
        <span className="plan-badge">Upgrade</span>
      </div>
      <div className="plan-name">{planName}</div>
      {daysLeft != null && <div className="plan-sub">{daysLeft} days remaining</div>}
      <div className="plan-bar"><span style={{ width: `${pct}%` }} /></div>
      <span className="plan-cta">Plans &amp; billing</span>
    </NavLink>
  );
}

export function Layout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo"><Logo /></div>
        <nav className="sidebar-nav">
          {nav.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
              <Icon size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <NavLink to="/settings" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
            <IconSettings size={20} />
            <span>Settings</span>
          </NavLink>
          <PlanCard />
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="searchbox">
            <IconSearch size={18} />
            <input placeholder="Search" />
          </div>
          <NotificationsBell />
          <button className="btn-ghost" onClick={logout}>Logout</button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
