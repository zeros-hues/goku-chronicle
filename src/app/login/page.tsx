'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import ChronicleWater from '@/components/chronicle-water/ChronicleWater';

export default function LoginPage() {
  const router = useRouter();
  const [username,   setUsername]   = useState('');
  const [password,   setPassword]   = useState('');
  const [error,      setError]      = useState('');
  const [shaking,    setShaking]    = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function shake() {
    setShaking(true);
    setTimeout(() => setShaking(false), 500);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) { setError('Please enter your username.'); shake(); return; }
    if (!password)        { setError('Please enter your password.');  shake(); return; }

    setSubmitting(true);
    const result = await signIn('credentials', {
      username: username.trim(),
      password,
      redirect: false,
    });
    setSubmitting(false);

    if (!result?.ok) {
      setError('Incorrect username or password.');
      shake();
      setPassword('');
      return;
    }
    router.push('/');
  }

  return (
    <div className="login-shell">

      {/* ── Left: interactive water ecosystem (60%) ── */}
      <div className="sea-panel">
        <ChronicleWater />

        {/* Chronicle logo floats above the water */}
        <div className="sea-logo">
          <h1 className="sea-title">Chron<span className="i">i</span>cle.</h1>
          <p className="sea-sub">Work log of Goku Studio</p>
        </div>
      </div>

      {/* ── Right: login panel (40%) ── */}
      <div className="login-panel">
        <div className={`login-card${shaking ? ' shake' : ''}`}>

          <p className="welcome">Welcome back.</p>
          <p className="welcome-sub">Sign in to your Chronicle workspace.</p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="input-block">
              <label className="field-label">Username</label>
              <input
                type="text"
                className={'field-input' + (error ? ' field-error' : '')}
                placeholder="admin"
                value={username}
                onChange={e => { setUsername(e.target.value); setError(''); }}
                autoComplete="username"
                autoFocus
                disabled={submitting}
              />
            </div>
            <div className="input-block">
              <label className="field-label">Password</label>
              <input
                type="password"
                className={'field-input' + (error ? ' field-error' : '')}
                placeholder="••••••••"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                autoComplete="current-password"
                disabled={submitting}
              />
            </div>

            {error && <div className="login-error">{error}</div>}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              style={{ width: '100%', justifyContent: 'center', marginTop: 8, opacity: submitting ? 0.7 : 1 }}
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="login-meta">
            <span>Goku Studio workspace</span>
            <a href="#" onClick={e => { e.preventDefault(); alert('Contact admin@gokustudio.com to reset your password.'); }}>
              Forgot password?
            </a>
          </div>

        </div>
      </div>

    </div>
  );
}
