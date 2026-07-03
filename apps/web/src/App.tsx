import { Routes, Route, Navigate } from 'react-router-dom';
import { isAuthed } from './lib/api';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Clients } from './pages/Clients';
import { Invoices } from './pages/Invoices';
import { Purchases } from './pages/Purchases';
import { BillForm } from './pages/BillForm';
import { ImportBills } from './pages/ImportBills';
import { Reports } from './pages/Reports';
import { Returns } from './pages/Returns';
import { Login } from './pages/Login';
import { Placeholder } from './pages/Placeholder';

function RequireAuth({ children }: { children: JSX.Element }) {
  return isAuthed() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="clients" element={<Clients />} />

        <Route path="invoices" element={<Invoices />} />
        <Route path="invoices/new" element={<BillForm />} />
        <Route path="invoices/import" element={<ImportBills />} />
        <Route path="invoices/:id/edit" element={<BillForm />} />

        <Route path="purchases" element={<Purchases />} />
        <Route path="purchases/new" element={<BillForm />} />
        <Route path="purchases/import" element={<ImportBills />} />
        <Route path="purchases/:id/edit" element={<BillForm />} />

        <Route path="recurring" element={<Placeholder title="Recurring Clients" note="Recurring billing schedules and add-recurring modal." />} />
        <Route path="expenses" element={<Placeholder title="Expenses" note="Expense tracking with categories and add-expense modal." />} />
        <Route path="receipts" element={<Placeholder title="Receipts" note="Payment receipts and add-receipt modal." />} />
        <Route path="reports" element={<Reports />} />
        <Route path="returns" element={<Returns />} />
        <Route path="settings" element={<Placeholder title="Settings" note="Theme, Company details, Terms, Notifications, App update." />} />
      </Route>
    </Routes>
  );
}
