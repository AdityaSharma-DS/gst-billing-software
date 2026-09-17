import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from './adminApi';
import { Logo } from '../components/Logo';

export function AdminLogin() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const { data } = await adminApi.post('/auth/login', { email, password });
      localStorage.setItem('adminToken', data.accessToken);
      localStorage.setItem('adminName', data.admin.fullName);
      nav('/admin');
    } catch { setErr('Invalid credentials'); }
    finally { setBusy(false); }
  }

  return (
    <div className="auth-wrap admin-dark">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo"><Logo /></div>
        <h1>Master Admin</h1>
        <p className="muted small">Platform console — licenses, plans &amp; GST APIs</p>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="username" /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" /></label>
        {err && <p className="error">{err}</p>}
        <button className="btn-block" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
