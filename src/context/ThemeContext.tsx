import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  isRemoteSettingsAppliedEvent,
  REMOTE_SETTINGS_APPLIED_EVENT,
  touchSettingsModified,
} from '../services/settingsEvents';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'market-dashboard-theme';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' ? 'light' : 'dark';
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);
  const hasHydratedTheme = useRef(false);
  const applyingRemoteRef = useRef(false);

  useLayoutEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    if (hasHydratedTheme.current) {
      touchSettingsModified('preferences');
    } else {
      hasHydratedTheme.current = true;
    }
  }, [theme]);

  useEffect(() => {
    const handleRemoteApply = (event: Event) => {
      if (!isRemoteSettingsAppliedEvent(event) || event.detail.domain !== 'preferences') return;
      applyingRemoteRef.current = true;
      setTheme(readStoredTheme());
    };

    window.addEventListener(REMOTE_SETTINGS_APPLIED_EVENT, handleRemoteApply);
    return () => window.removeEventListener(REMOTE_SETTINGS_APPLIED_EVENT, handleRemoteApply);
  }, []);

  const value = useMemo(
    () => ({
      theme,
      toggleTheme: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')),
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
