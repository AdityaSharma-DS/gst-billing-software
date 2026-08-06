import { NavLink, Outlet } from 'react-router-dom';
import { logout } from '../lib/api';
import { Logo } from './Logo';
import {
  IconDashboard, IconClients, IconPlus, IconRecurring, IconExpenses,
  IconPurchases, IconReceipts, IconReports, IconReturns, IconSettings,
  IconSearch, IconBell, IconBox,
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
];

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
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="searchbox">
            <IconSearch size={18} />
            <input placeholder="Search" />
          </div>
          <button className="icon-btn" aria-label="Notifications"><IconBell size={20} /></button>
          <button className="btn-ghost" onClick={logout}>Logout</button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
