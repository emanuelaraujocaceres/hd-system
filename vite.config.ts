import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const plugins = [react(), tailwindcss()];

  // Sentry plugin for source maps (production only, needs SENTRY_AUTH_TOKEN)
  if (process.env.SENTRY_AUTH_TOKEN) {
    // @ts-ignore — @sentry/vite-plugin is optional; not installed in dev/CI
    import('@sentry/vite-plugin')
      .then(({ sentryVitePlugin }) => {
        plugins.push(
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            sourcemaps: {
              assets: './dist/**',
            },
          })
        );
      })
      .catch(() => {
        // @sentry/vite-plugin not installed — skip silently
      });
  }

  return {
    plugins,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            // React + React DOM
            if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) {
              return 'vendor-react';
            }
            // Lucide icons (very heavy)
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-icons';
            }
            // Other node_modules
            if (id.includes('node_modules')) {
              return 'vendor';
            }
          },
        },
      },
    },
  };
});
