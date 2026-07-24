import { useEffect, useState, useCallback } from 'react';

// Global light/dark theme. Toggles `.dark` on <html> and persists to localStorage.
// CSS variables in index.css cascade from `:root.dark`, so one class flips the whole app.
export function useTheme() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    document.body.classList.toggle('dark-mode', theme === 'dark'); // legacy hook used by some CSS
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);

  return { theme, toggleTheme, isDark: theme === 'dark' };
}
