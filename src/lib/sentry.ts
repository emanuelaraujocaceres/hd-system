/**
 * Sentry Integration for HD-System
 *
 * Captura erros não tratados em produção.
 * Configurado via VITE_SENTRY_DSN (variável de ambiente).
 *
 * Uso:
 *   import { sentry } from './lib/sentry';
 *   if (sentry) sentry.captureException(error);
 */

import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

let sentryInstance: typeof Sentry | null = null;

function initSentry() {
  if (!DSN) {
    console.info('[Sentry] VITE_SENTRY_DSN não configurado — Sentry desativado.');
    return null;
  }

  try {
    Sentry.init({
      dsn: DSN,
      environment: import.meta.env.MODE || 'development',

      // Send errors in production AND dev (when DSN is configured)
      enabled: true,

      // Sample rate: 100% of errors, 10% of performance traces
      tracesSampleRate: 0.1,

      // Don't send PII
      sendDefaultPii: false,

      // Integrations
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: false,
          blockAllMedia: false,
        }),
      ],

      // Allow URLs
      allowUrls: [
        /localhost/,
        /hd-system/,
        /.pages\.dev/,
      ],

      // Ignore common noise
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'Non-Error promise rejection captured',
        'Network request failed',
        'Loading chunk .* failed',
        'Script error.',
        // PWA offline errors
        'Failed to fetch',
        'Load failed',
      ],

      // Tags for context
      tags: {
        app: 'hd-system',
        version: import.meta.env.VITE_APP_VERSION || 'dev',
      },
    });

    // DSN logged without revealing full key
    console.info('[Sentry] ✅ Inicializado — environment:', import.meta.env.MODE);
    return Sentry;
  } catch (err) {
    console.error('[Sentry] ❌ Falha ao inicializar:', err);
    return null;
  }
}

// Initialize on module load (lazy — only if DSN exists)
console.log('[Sentry] Module loaded, DSN available:', !!DSN);
if (DSN) {
  sentryInstance = initSentry();
}

export { sentryInstance as sentry };

/**
 * Helper: set user context for Sentry
 */
export function setSentryUser(user: { id: string; email?: string; role?: string }) {
  if (sentryInstance) {
    sentryInstance.setUser({
      id: user.id,
      email: user.email,
      // 'role' is not a standard Sentry user field — use segment instead
      segment: user.role,
    });
  }
}

/**
 * Helper: clear user context (on logout)
 */
export function clearSentryUser() {
  if (sentryInstance) {
    sentryInstance.setUser(null);
  }
}

/**
 * Helper: add breadcrumb for navigation
 */
export function sentryBreadcrumb(message: string, data?: Record<string, unknown>) {
  if (sentryInstance) {
    sentryInstance.addBreadcrumb({
      message,
      data,
      level: 'info',
      category: 'navigation',
    });
  }
}
