import { NavLink, Outlet } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { adminLogout } from './adminApi';
import { IconDashboard, IconClients, IconReports, IconSettings } from '../components/icons';

const nav = [
  { to: '/admin', label: 'Overview', Icon: IconDashboard, end: true },
  { to: '/admin/tenants', label: 'Tenants & Licenses', Icon: IconClients },
  { to: '/admin/plans', label: 'Plans & Billing', Icon: IconReports },
  { to: '/admin/gst-apis', label: 'GST API Config', Icon: IconSettings },
];

export function AdminLayout() {
  return (
    <div className="app-shell admin-shell">
      <aside className="sidebar sidebar--admin">
        <div className="sidebar-logo"><Logo /><span className="admin-tag">MASTER</span></div>
        <nav className="sidebar-nav">
          {nav.map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end as any} className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
              <Icon size={20} /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="nav-item nav-item--btn" onClick={adminLogout}><span>Logout</span></button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <span className="muted small">Signed in as {localStorage.getItem('adminName') ?? 'Master Admin'}</span>
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
