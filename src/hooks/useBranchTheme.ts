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
 * Aplica as cores do tema da filial como CSS variables no documento.
 * Aplica em AMBOS os modos (claro e escuro): as variáveis do :root são
 * definidas com os valores configurados na aba Aparência, sobrepondo os
 * defaults do index.css. Observa a classe `dark` do <html> para reaplicar
 * quando o usuário alterna o tema (claro/escuro).
 *
 * NOTA (2026): hoje nenhum componente lê var(--color-*) via Tailwind fixo
 * (bg-indigo-600, dark:bg-[...]). A personalização visual de verdade exige
 * migrar os componentes para as variáveis — fora de escopo. Este hook já
 * garante que as variáveis estejam sempre corretas para quando isso ocorrer,
 * e os previews da aba usam essas variáveis.
 */
export function useBranchTheme(theme: ThemeColors | null) {
  useEffect(() => {
    const applyTheme = () => {
      const t = theme ?? DEFAULT_THEME;
      const r = document.documentElement.style;

      // Core colors (aplicadas também no modo escuro — sobrepõem os defaults)
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
    };

    applyTheme();

    // Reaplica quando a classe dark/light muda no <html> (toggle de tema no app)
    const docEl = document.documentElement;
    const observer = new MutationObserver(() => applyTheme());
    observer.observe(docEl, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [theme]);
}

export { DEFAULT_THEME };
