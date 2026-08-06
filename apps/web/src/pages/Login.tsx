import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Logo } from '../components/Logo';

export function Login() {
  const navigate = useNavigate();
  const [tenantSlug, setTenant] = useState('demo');
  const [email, setEmail] = useState('admin@demo.test');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/auth/login', { tenantSlug, email, password });
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('tenantId', data.user.tenantId ?? '');
      localStorage.setItem('userRole', data.user.role ?? '');
      localStorage.setItem('userName', data.user.fullName ?? '');
      navigate('/dashboard');
    } catch {
      setError('Invalid credentials');
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-logo"><Logo /></div>
        <h1>Sign in</h1>
        <p className="muted small">Don't have an account? <a>Register here</a></p>

        <label>Organization<input value={tenantSlug} onChange={(e) => setTenant(e.target.value)} /></label>
        <label>Email<input placeholder="Enter Your Email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>

        <div className="auth-row">
          <label className="checkbox"><input type="checkbox" /> Remember me</label>
          <a className="small">Forgot password?</a>
        </div>

        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn-block">Sign in</button>
      </form>
    </div>
  );
}
