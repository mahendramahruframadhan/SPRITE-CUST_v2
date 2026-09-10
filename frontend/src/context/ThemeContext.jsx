import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);
const LS_KEY = 'theme'; // 'light' | 'dark'

function initialTheme() {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* abaikan */
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
    try {
      localStorage.setItem(LS_KEY, theme);
    } catch {
      /* abaikan */
    }
  }, [theme]);

  return (
    <ThemeContext.Provider
      value={{ theme, setTheme, isDark: theme === 'dark', toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme harus dipakai di dalam ThemeProvider');
  return ctx;
}
