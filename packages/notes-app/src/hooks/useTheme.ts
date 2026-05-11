import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'bizerbrain-theme';

function readTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // Storage may be disabled; fall through.
  }
  return 'system';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

export function useTheme(): {
  theme: Theme;
  setTheme: (next: Theme) => void;
  cycleTheme: () => void;
} {
  const [theme, setThemeState] = useState<Theme>(readTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignore quota / privacy-mode errors.
    }
  }, [theme]);

  return {
    theme,
    setTheme: setThemeState,
    cycleTheme: () =>
      setThemeState((prev) => (prev === 'system' ? 'light' : prev === 'light' ? 'dark' : 'system'))
  };
}
