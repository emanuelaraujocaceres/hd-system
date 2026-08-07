import { useEffect } from 'react';

export interface ThemeColors {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  bgColor: string;
  logoUrl?: string;
  faviconUrl?: string;
}

const DEFAULT_THEME: ThemeColors = {
  primaryColor: '#4f46e5',
  secondaryColor: '#6366f1',
  accentColor: '#f59e0b',
  bgColor: '#09090b',
};

/**
 * Apply a branch theme to the document as CSS variables.
 * Falls back to defaults when theme is null/empty.
 */
export function useBranchTheme(theme: ThemeColors | null) {
  useEffect(() => {
    const t = theme ?? DEFAULT_THEME;
    const r = document.documentElement.style;
    r.setProperty('--color-primary', t.primaryColor);
    r.setProperty('--color-secondary', t.secondaryColor);
    r.setProperty('--color-accent', t.accentColor);
    r.setProperty('--color-bg', t.bgColor);

    // Update favicon if provided
    if (t.faviconUrl) {
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (link) link.href = t.faviconUrl;
    }
  }, [theme]);
}

export { DEFAULT_THEME };
