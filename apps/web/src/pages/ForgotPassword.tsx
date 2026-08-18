import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Logo } from '../components/Logo';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email: email.trim() });
      setSent(true);
      // In dev / when email isn't configured, the API returns the link so it's testable.
      setDevLink(data?.resetUrl ?? null);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Something went wrong. Please try again.');
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-logo"><Logo /></div>
        <h1>Reset password</h1>

        {!sent ? (
          <>
            <p className="muted small">Enter your account email and we'll send you a link to reset your password.</p>
            <label>Email<input type="email" placeholder="you@business.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            {error && <p className="error">{error}</p>}
            <button type="submit" className="btn-block" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
            <p className="muted small center"><Link to="/login">Back to sign in</Link></p>
          </>
        ) : (
          <>
            <p className="muted small">If an account exists for <strong>{email}</strong>, we've sent a password reset link. It expires in 1 hour — check your inbox (and spam).</p>
            {devLink && (
              <p className="muted small" style={{ wordBreak: 'break-all' }}>
                Email isn't configured on this environment, so here's your reset link for testing:<br />
                <Link to={devLink.replace(/^https?:\/\/[^/]+/, '')}>{devLink}</Link>
              </p>
            )}
            <p className="muted small center"><Link to="/login">Back to sign in</Link></p>
          </>
        )}
      </form>
    </div>
  );
}
