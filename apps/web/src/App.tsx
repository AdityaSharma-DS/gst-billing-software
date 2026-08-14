import { Routes, Route, Navigate } from 'react-router-dom';
import { isAuthed } from './lib/api';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Clients } from './pages/Clients';
import { Vendors } from './pages/Vendors';
import { Inventory } from './pages/Inventory';
import { Invoices } from './pages/Invoices';
import { EwayBills } from './pages/EwayBills';
import { Purchases } from './pages/Purchases';
import { BillForm } from './pages/BillForm';
import { ImportBills } from './pages/ImportBills';
import { Reports } from './pages/Reports';
import { Receipts } from './pages/Receipts';
import { Returns } from './pages/Returns';
import { Compliance } from './pages/Compliance';
import { Settings } from './pages/Settings';
import { Billing } from './pages/Billing';
import { Expenses } from './pages/Expenses';
import { Recurring } from './pages/Recurring';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Toaster } from './components/Toaster';
import { isAdminAuthed } from './admin/adminApi';
import { AdminLogin } from './admin/AdminLogin';
import { AdminLayout } from './admin/AdminLayout';
import { AdminOverview } from './admin/AdminOverview';
import { AdminTenants } from './admin/AdminTenants';
import { AdminPlans } from './admin/AdminPlans';
import { AdminGstConfig } from './admin/AdminGstConfig';

function RequireAdmin({ children }: { children: JSX.Element }) {
  return isAdminAuthed() ? children : <Navigate to="/admin/login" replace />;
}

function RequireAuth({ children }: { children: JSX.Element }) {
  return isAuthed() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <>
    <Toaster />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Master admin panel (platform operator) */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
        <Route index element={<AdminOverview />} />
        <Route path="tenants" element={<AdminTenants />} />
        <Route path="plans" element={<AdminPlans />} />
        <Route path="gst-apis" element={<AdminGstConfig />} />
      </Route>
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="clients" element={<Clients />} />
        <Route path="vendors" element={<Vendors />} />
        <Route path="inventory" element={<Inventory />} />

        <Route path="invoices" element={<Invoices />} />
        <Route path="invoices/new" element={<BillForm />} />
        <Route path="invoices/import" element={<ImportBills />} />
        <Route path="invoices/:id/edit" element={<BillForm />} />

        <Route path="purchases" element={<Purchases />} />
        <Route path="purchases/new" element={<BillForm />} />
        <Route path="purchases/import" element={<ImportBills />} />
        <Route path="purchases/:id/edit" element={<BillForm />} />

        <Route path="recurring" element={<Recurring />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="receipts" element={<Receipts />} />
        <Route path="reports" element={<Reports />} />
        <Route path="eway" element={<EwayBills />} />
        <Route path="returns" element={<Returns />} />
        <Route path="compliance" element={<Compliance />} />
        <Route path="settings" element={<Settings />} />
        <Route path="billing" element={<Billing />} />
      </Route>
    </Routes>
    </>
  );
}
