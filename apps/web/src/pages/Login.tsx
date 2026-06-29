import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

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
      navigate('/dashboard');
    } catch {
      setError('Invalid credentials');
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <h1>GST Billing</h1>
        <label>Organization<input value={tenantSlug} onChange={(e) => setTenant(e.target.value)} /></label>
        <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        <button type="submit">Sign in</button>
      </form>
    </div>
  );
}
