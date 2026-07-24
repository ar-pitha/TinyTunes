import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Music2, Mail, Lock, Eye, EyeOff, Radio, Heart, Cloud } from 'lucide-react';
import './auth.css';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.user.username);
      window.dispatchEvent(new Event('auth-change'));
      navigate('/songmanager');
    } catch (err) {
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="auth">
      <aside className="auth__aside">
        <div className="auth__brand">
          <span className="auth__brand-mark"><Music2 size={20} /></span>
          MusicApp
        </div>
        <div className="auth__aside-body">
          <h1 className="auth__aside-title">Your music, everywhere you are.</h1>
          <p className="auth__aside-sub">Stream, organize, and listen together in real-time rooms — all in one beautifully simple player.</p>
          <div className="auth__features">
            <div className="auth__feature"><span className="auth__feature-ic"><Radio size={16} /></span> Listen together in live rooms</div>
            <div className="auth__feature"><span className="auth__feature-ic"><Heart size={16} /></span> Curate your favorites</div>
            <div className="auth__feature"><span className="auth__feature-ic"><Cloud size={16} /></span> Online &amp; offline playback</div>
          </div>
        </div>
        <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>© {new Date().getFullYear()} MusicApp</div>
      </aside>

      <main className="auth__main">
        <div className="auth__card">
          <div className="auth__head">
            <h2 className="auth__title">Welcome back</h2>
            <p className="auth__subtitle">Sign in to continue to your library</p>
          </div>

          <form onSubmit={handleLogin}>
            <div className="auth__field">
              <label className="auth__label" htmlFor="login-email">Email address</label>
              <div className="auth__input-wrap">
                <span className="auth__input-ic"><Mail size={18} /></span>
                <input
                  id="login-email"
                  type="email"
                  className="auth__input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="auth__field">
              <label className="auth__label" htmlFor="login-password">Password</label>
              <div className="auth__input-wrap">
                <span className="auth__input-ic"><Lock size={18} /></span>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="auth__input auth__input--pw"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <button type="button" className="auth__pw-toggle" onClick={() => setShowPassword((s) => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && <div className="auth__error" role="alert">{error}</div>}

            <button type="submit" className={`ds-btn ds-btn--primary ds-btn--lg ds-btn--block ${loading ? 'ds-btn--loading' : ''}`} disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>

            <div className="auth__footer">
              Don't have an account? <Link to="/signup" className="auth__link">Sign up</Link>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};

export default Login;
