import { useEffect } from 'react';

export interface ThemeColors {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  bgColor: string;
  // Extended colors
  buttonBg?: string;
  buttonText?: string;
  menuBg?: string;
  signalRed?: string;
  signalGreen?: string;
  signalYellow?: string;
  logoUrl?: string;
  faviconUrl?: string;
}

const DEFAULT_THEME: ThemeColors = {
  primaryColor: '#4f46e5',
  secondaryColor: '#6366f1',
  accentColor: '#f59e0b',
  bgColor: '#ffffff',
  buttonBg: '#4f46e5',
  buttonText: '#ffffff',
  menuBg: '#1e293b',
  signalRed: '#ef4444',
  signalGreen: '#22c55e',
  signalYellow: '#eab308',
};

/**
 * Apply a branch theme to the document as CSS variables.
 * ONLY applies in light mode - dark mode uses its own styles.
 * Falls back to defaults when theme is null/empty.
 */
export function useBranchTheme(theme: ThemeColors | null) {
  useEffect(() => {
    // Only apply theme in light mode
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) return;

    const t = theme ?? DEFAULT_THEME;
    const r = document.documentElement.style;
    
    // Core colors
    r.setProperty('--color-primary', t.primaryColor);
    r.setProperty('--color-secondary', t.secondaryColor);
    r.setProperty('--color-accent', t.accentColor);
    r.setProperty('--color-bg', t.bgColor || '#ffffff');
    
    // Extended colors
    r.setProperty('--color-button-bg', t.buttonBg || t.primaryColor);
    r.setProperty('--color-button-text', t.buttonText || '#ffffff');
    r.setProperty('--color-menu-bg', t.menuBg || '#1e293b');
    r.setProperty('--color-signal-red', t.signalRed || '#ef4444');
    r.setProperty('--color-signal-green', t.signalGreen || '#22c55e');
    r.setProperty('--color-signal-yellow', t.signalYellow || '#eab308');

    // Update favicon if provided
    if (t.faviconUrl) {
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (link) link.href = t.faviconUrl;
    }
  }, [theme]);
}

export { DEFAULT_THEME };
