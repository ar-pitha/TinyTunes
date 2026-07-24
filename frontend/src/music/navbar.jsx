import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  Music2, Heart, Users, Smartphone, Search, Bell,
  Sun, Moon, Menu, X, LogOut, User, LogIn, ChevronDown,
} from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import './navbar.css';

const NAV_ITEMS = [
  { to: '/songmanager', label: 'Songs', icon: Music2 },
  { to: '/favorite', label: 'Favorites', icon: Heart },
  { to: '/room', label: 'Rooms', icon: Users },
  { to: '/offline-music', label: 'Device Music', icon: Smartphone },
];

const Header = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const userRef = useRef(null);

  // Auth state — synced across tabs and via same-tab 'auth-change' event
  useEffect(() => {
    const checkAuth = () => {
      const username = localStorage.getItem('username');
      const token = localStorage.getItem('token');
      if (username && token) { setUser(username); setIsLoggedIn(true); }
      else { setUser(null); setIsLoggedIn(false); }
    };
    checkAuth();
    window.addEventListener('storage', checkAuth);
    window.addEventListener('auth-change', checkAuth);
    return () => {
      window.removeEventListener('storage', checkAuth);
      window.removeEventListener('auth-change', checkAuth);
    };
  }, []);

  // Close dropdown on outside click / ESC
  useEffect(() => {
    const onClick = (e) => { if (userRef.current && !userRef.current.contains(e.target)) setMenuOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { setMenuOpen(false); setDrawerOpen(false); } };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, []);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  const handleLogout = () => {
    localStorage.removeItem('joinedRoomCode');
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setUser(null);
    setIsLoggedIn(false);
    setMenuOpen(false);
    setDrawerOpen(false);
    window.dispatchEvent(new Event('auth-change'));
    navigate('/login');
  };

  const initials = (user || 'U').trim().charAt(0).toUpperCase();

  return (
    <header className="nav ds-glass">
      <Link to="/songmanager" className="nav__brand">
        <span className="nav__brand-mark"><Music2 size={18} /></span>
        MusicApp
      </Link>

      <nav className="nav__links">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className="nav__link">
            <Icon size={16} /> {label}
          </NavLink>
        ))}
      </nav>

      <div className="nav__right">
        <label className="nav__search">
          <Search size={16} />
          <input type="text" placeholder="Search songs, rooms…" aria-label="Search" />
          <kbd>Ctrl K</kbd>
        </label>

        <button
          className="nav__icon-btn nav__icon-btn--theme"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          title={isDark ? 'Light mode' : 'Dark mode'}
        >
          {isDark ? <Sun size={19} /> : <Moon size={19} />}
        </button>

        {isLoggedIn && (
          <button className="nav__icon-btn" aria-label="Notifications" title="Notifications">
            <Bell size={19} />
            <span className="nav__badge-dot" />
          </button>
        )}

        {isLoggedIn && user ? (
          <div className="nav__user" ref={userRef}>
            <button className="nav__user-trigger" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen}>
              <span className="nav__avatar">{initials}</span>
              <span className="nav__user-name">{user}</span>
              <ChevronDown size={15} style={{ color: 'var(--color-text-muted)' }} />
            </button>
            {menuOpen && (
              <div className="nav__menu" role="menu">
                <div className="nav__menu-header">
                  <div className="name">{user}</div>
                  <div className="sub">Signed in</div>
                </div>
                <Link to="/songmanager" className="nav__menu-item" role="menuitem" onClick={() => setMenuOpen(false)}>
                  <User size={16} /> My Library
                </Link>
                <button className="nav__menu-item danger" role="menuitem" onClick={handleLogout}>
                  <LogOut size={16} /> Log out
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <Link to="/login" className="ds-btn ds-btn--ghost"><LogIn size={16} /> Login</Link>
            <Link to="/signup" className="ds-btn ds-btn--primary">Sign up</Link>
          </>
        )}

        <button className="nav__icon-btn nav__hamburger" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
          <Menu size={22} />
        </button>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <>
          <div className="nav__scrim" onClick={() => setDrawerOpen(false)} />
          <aside className="nav__drawer" role="dialog" aria-label="Menu">
            <div className="nav__drawer-head">
              <Link to="/songmanager" className="nav__brand" onClick={() => setDrawerOpen(false)}>
                <span className="nav__brand-mark"><Music2 size={18} /></span> MusicApp
              </Link>
              <button className="nav__icon-btn" onClick={() => setDrawerOpen(false)} aria-label="Close menu"><X size={22} /></button>
            </div>

            <nav className="nav__drawer-links">
              {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} className="nav__drawer-link" onClick={() => setDrawerOpen(false)}>
                  <Icon size={20} /> {label}
                </NavLink>
              ))}
            </nav>

            <div className="nav__drawer-foot">
              <button className="nav__drawer-link" onClick={toggleTheme}>
                {isDark ? <Sun size={20} /> : <Moon size={20} />} {isDark ? 'Light mode' : 'Dark mode'}
              </button>
              {isLoggedIn && user ? (
                <>
                  <div className="nav__drawer-user">
                    <span className="nav__avatar">{initials}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>{user}</div>
                      <div style={{ fontSize: 'var(--text-caption)', color: 'var(--color-text-muted)' }}>Signed in</div>
                    </div>
                  </div>
                  <button className="ds-btn ds-btn--danger ds-btn--block" onClick={handleLogout}><LogOut size={16} /> Log out</button>
                </>
              ) : (
                <>
                  <Link to="/login" className="ds-btn ds-btn--secondary ds-btn--block" onClick={() => setDrawerOpen(false)}><LogIn size={16} /> Login</Link>
                  <Link to="/signup" className="ds-btn ds-btn--primary ds-btn--block" onClick={() => setDrawerOpen(false)}>Sign up</Link>
                </>
              )}
            </div>
          </aside>
        </>
      )}
    </header>
  );
};

export default Header;
