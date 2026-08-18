import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Logo } from '../components/Logo';
import { PasswordInput } from '../components/PasswordInput';

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const { data } = await api.post('/auth/login', { email: email.trim(), password });
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('tenantId', data.user.tenantId ?? '');
      localStorage.setItem('userRole', data.user.role ?? '');
      localStorage.setItem('userName', data.user.fullName ?? '');
      navigate('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Invalid email or password.');
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-logo"><Logo /></div>
        <h1>Sign in</h1>
        <p className="muted small">Don't have an account? <Link to="/register">Create one</Link></p>

        <label>Email<input type="email" placeholder="you@business.com" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<PasswordInput placeholder="Password" value={password} onChange={setPassword} autoComplete="current-password" /></label>

        <div className="auth-row">
          <label className="checkbox"><input type="checkbox" /> Remember me</label>
          <a className="small">Forgot password?</a>
        </div>

        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
