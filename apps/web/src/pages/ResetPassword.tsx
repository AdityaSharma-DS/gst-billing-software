import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Logo } from '../components/Logo';
import { PasswordInput } from '../components/PasswordInput';

export function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => navigate('/login'), 1800);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'This reset link is invalid or has expired. Please request a new one.');
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-logo"><Logo /></div>
        <h1>Set a new password</h1>

        {!token ? (
          <>
            <p className="error">This reset link is missing its token. Please request a new one.</p>
            <p className="muted small center"><Link to="/forgot-password">Request a new link</Link></p>
          </>
        ) : done ? (
          <>
            <p className="muted small">✅ Your password has been reset. Redirecting you to sign in…</p>
            <p className="muted small center"><Link to="/login">Go to sign in</Link></p>
          </>
        ) : (
          <>
            <p className="muted small">Choose a new password for your account.</p>
            <label>New password<PasswordInput placeholder="At least 6 characters" value={password} onChange={setPassword} autoComplete="new-password" /></label>
            <label>Confirm password<PasswordInput placeholder="Re-enter password" value={confirm} onChange={setConfirm} autoComplete="new-password" /></label>
            {error && <p className="error">{error}</p>}
            <button type="submit" className="btn-block" disabled={busy}>{busy ? 'Saving…' : 'Reset password'}</button>
            <p className="muted small center"><Link to="/login">Back to sign in</Link></p>
          </>
        )}
      </form>
    </div>
  );
}
