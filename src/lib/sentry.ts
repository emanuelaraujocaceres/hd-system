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

      // Performance sampling
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,

      // Integrations
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: false,
          blockAllMedia: false,
        }),
      ],

      // Allow URLs (disabled — console-thrown errors use VM context, not app URLs)
      // allowUrls is useful to filter 3rd-party scripts but blocks console tests
      // allowUrls: [/localhost/, /hd-system/, /.pages\.dev/],

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
    });

    // Set tags after init (not valid in init options for v8)
    Sentry.setTag('app', 'hd-system');
    Sentry.setTag('version', import.meta.env.VITE_APP_VERSION || 'dev');

    // DSN logged without revealing full key
    return Sentry;
  } catch (err) {
    console.error('[Sentry] ❌ Falha ao inicializar:', err);
    return null;
  }
}

// Initialize on module load (lazy — only if DSN exists)
if (DSN) {
  sentryInstance = initSentry();
  // Expose on window for console debugging: Sentry.captureException(new Error('test'))
  if (sentryInstance) {
    (window as any).Sentry = sentryInstance;
  }
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
