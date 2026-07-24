import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Music2, User, Mail, Lock, Eye, EyeOff, Sparkles, Users, ListMusic } from 'lucide-react';
import './auth.css';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

const Signup = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Signup failed');
        setLoading(false);
        return;
      }

      alert(`Welcome, ${data.user.username}! Redirecting to login...`);
      setTimeout(() => { window.location.href = '/login'; }, 1500);
    } catch (err) {
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  };

  const strength = password.length === 0 ? null
    : password.length < 6 ? 'weak'
    : password.length < 10 ? 'medium'
    : 'strong';
  const strengthLabel = { weak: 'Weak password', medium: 'Good password', strong: 'Strong password' };

  return (
    <div className="auth">
      <aside className="auth__aside">
        <div className="auth__brand">
          <span className="auth__brand-mark"><Music2 size={20} /></span>
          MusicApp
        </div>
        <div className="auth__aside-body">
          <h1 className="auth__aside-title">Start your music journey today.</h1>
          <p className="auth__aside-sub">Create a free account and unlock a premium listening experience built for sharing.</p>
          <div className="auth__features">
            <div className="auth__feature"><span className="auth__feature-ic"><Sparkles size={16} /></span> Free to get started</div>
            <div className="auth__feature"><span className="auth__feature-ic"><Users size={16} /></span> Host live listening rooms</div>
            <div className="auth__feature"><span className="auth__feature-ic"><ListMusic size={16} /></span> Build unlimited playlists</div>
          </div>
        </div>
        <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>© {new Date().getFullYear()} MusicApp</div>
      </aside>

      <main className="auth__main">
        <div className="auth__card">
          <div className="auth__head">
            <h2 className="auth__title">Create your account</h2>
            <p className="auth__subtitle">Join and start listening in minutes</p>
          </div>

          <form onSubmit={handleSignup}>
            <div className="auth__field">
              <label className="auth__label" htmlFor="su-username">Username</label>
              <div className="auth__input-wrap">
                <span className="auth__input-ic"><User size={18} /></span>
                <input id="su-username" type="text" className="auth__input" value={username}
                  onChange={(e) => setUsername(e.target.value)} placeholder="Choose a username" autoComplete="username" required />
              </div>
            </div>

            <div className="auth__field">
              <label className="auth__label" htmlFor="su-email">Email address</label>
              <div className="auth__input-wrap">
                <span className="auth__input-ic"><Mail size={18} /></span>
                <input id="su-email" type="email" className="auth__input" value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
              </div>
            </div>

            <div className="auth__field">
              <label className="auth__label" htmlFor="su-password">Password</label>
              <div className="auth__input-wrap">
                <span className="auth__input-ic"><Lock size={18} /></span>
                <input id="su-password" type={showPassword ? 'text' : 'password'} className="auth__input auth__input--pw" value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="Create a strong password" autoComplete="new-password" required />
                <button type="button" className="auth__pw-toggle" onClick={() => setShowPassword((s) => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {strength && (
                <div className="auth__strength">
                  <div className="auth__strength-bar">
                    <div className={`auth__strength-fill auth__strength-${strength}`} />
                  </div>
                  <span className="auth__strength-label">{strengthLabel[strength]}</span>
                </div>
              )}
            </div>

            {error && <div className="auth__error" role="alert">{error}</div>}

            <button type="submit" className={`ds-btn ds-btn--primary ds-btn--lg ds-btn--block ${loading ? 'ds-btn--loading' : ''}`} disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'}
            </button>

            <div className="auth__footer">
              Already have an account? <Link to="/login" className="auth__link">Log in</Link>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};

export default Signup;
