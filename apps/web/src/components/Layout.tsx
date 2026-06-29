import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/bills', label: 'Bills' },
  { to: '/returns', label: 'GST Returns' },
];

export function Layout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1 className="brand">GST Billing</h1>
        <nav>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {l.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
