import { Routes, Route, Navigate } from 'react-router-dom';
import { isAuthed } from './lib/api';
import { Layout } from './components/Layout';

function RequireAuth({ children }: { children: JSX.Element }) {
  return isAuthed() ? children : <Navigate to="/login" replace />;
}
import { Dashboard } from './pages/Dashboard';
import { Clients } from './pages/Clients';
import { NewInvoice } from './pages/NewInvoice';
import { Reports } from './pages/Reports';
import { Returns } from './pages/Returns';
import { Login } from './pages/Login';
import { Placeholder } from './pages/Placeholder';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="clients" element={<Clients />} />
        <Route path="invoices" element={<NewInvoice />} />
        <Route path="recurring" element={<Placeholder title="Recurring Clients" note="Recurring billing schedules and add-recurring modal." />} />
        <Route path="expenses" element={<Placeholder title="Expenses" note="Expense tracking with categories and add-expense modal." />} />
        <Route path="purchases" element={<Placeholder title="Purchases" note="Purchase bills with add-purchase modal." />} />
        <Route path="receipts" element={<Placeholder title="Receipts" note="Payment receipts and add-receipt modal." />} />
        <Route path="reports" element={<Reports />} />
        <Route path="returns" element={<Returns />} />
        <Route path="settings" element={<Placeholder title="Settings" note="Theme, Company details, Terms, Notifications, App update." />} />
      </Route>
    </Routes>
  );
}
