import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Logo } from '../components/Logo';
import { PasswordInput } from '../components/PasswordInput';
import { isValidGstin } from '../lib/gstin';

export function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ businessName: '', fullName: '', email: '', password: '', gstin: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (form.businessName.trim().length < 2) return setError('Enter your business name.');
    if (form.password.length < 6) return setError('Password must be at least 6 characters.');
    if (form.gstin && !isValidGstin(form.gstin)) return setError('That GSTIN looks invalid (checksum failed). Leave it blank to add later.');
    setBusy(true);
    try {
      const { data } = await api.post('/auth/register', {
        businessName: form.businessName.trim(),
        fullName: form.fullName.trim() || form.businessName.trim(),
        email: form.email.trim(),
        password: form.password,
        gstin: form.gstin.trim() || undefined,
      });
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('tenantId', data.user.tenantId ?? '');
      localStorage.setItem('tenantSlug', data.tenantSlug ?? '');
      localStorage.setItem('userRole', data.user.role ?? '');
      localStorage.setItem('userName', data.user.fullName ?? '');
      navigate('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not create your account. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-logo"><Logo /></div>
        <h1>Create your account</h1>
        <p className="muted small">Start billing free for 14 days. Already have an account? <Link to="/login">Sign in</Link></p>

        <label>Business Name<input autoFocus placeholder="e.g. Sharma Traders" value={form.businessName} onChange={(e) => set('businessName', e.target.value)} /></label>
        <label>Your Name<input placeholder="Full name" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} /></label>
        <label>Email<input type="email" placeholder="you@business.com" value={form.email} onChange={(e) => set('email', e.target.value)} /></label>
        <label>Password<PasswordInput placeholder="At least 6 characters" value={form.password} onChange={(v) => set('password', v)} autoComplete="new-password" /></label>
        <label>GSTIN <span className="muted small">(optional — add later in Settings)</span><input placeholder="27ABCDE1234F1Z5" value={form.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} /></label>

        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn-block" disabled={busy}>{busy ? 'Creating your account…' : 'Create account'}</button>
        <p className="muted small center">No card required. You can invite your team and set up GST after signing in.</p>
      </form>
    </div>
  );
}
