import 'barcode-detector/pure';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { PublicMenuView } from './components/CardapioDigital/PublicMenuView.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { QueryProvider } from './providers/QueryProvider';
import './lib/sentry'; // Initialize Sentry ASAP (captures all subsequent errors)
import './index.css';

// ─── PWA: registra o service worker para funcionar offline ─────────
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => console.warn('[HD-System] Registro do service worker falhou:', err));
  });
}

// ─── Roteamento público (cardápio digital) ─────────────────────────
// URLs públicas: #/mesa/{token} | #/delivery/{filialId} | #/cardapio/{filialId}
function getPublicRoute(): { type: 'menu'; token: string } | { type: 'delivery'; filialId: string } | null {
  const hash = window.location.hash;
  const mesaMatch = hash.match(/^#\/mesa\/(.+)$/);
  if (mesaMatch) {
    try {
      return { type: 'menu', token: decodeURIComponent(mesaMatch[1]) };
    } catch {
      return { type: 'menu', token: mesaMatch[1] };
    }
  }
  // ✅ Delivery/Cardápio route with filial isolation
  const deliveryMatch = hash.match(/^#\/delivery\/(.+)$/);
  if (deliveryMatch) {
    return { type: 'delivery', filialId: deliveryMatch[1] };
  }
  // Fallback for old URLs without filial ID
  if (hash === '#/delivery' || hash === '#/cardapio') {
    return { type: 'delivery', filialId: 'default' };
  }
  return null;
}

function handleClosePublic() {
  window.location.hash = '';
  window.location.reload();
}

const root = createRoot(document.getElementById('root')!);

function render() {
  const route = getPublicRoute();
  if (route?.type === 'menu') {
    root.render(
      <StrictMode>
        <QueryProvider>
          <ErrorBoundary scope="Cardápio Digital">
            <PublicMenuView tableToken={route.token} onClose={handleClosePublic} />
          </ErrorBoundary>
        </QueryProvider>
      </StrictMode>,
    );
  } else if (route?.type === 'delivery') {
    root.render(
      <StrictMode>
        <QueryProvider>
          <ErrorBoundary scope="Delivery">
            <PublicMenuView tableToken="delivery" filialId={route.filialId} onClose={handleClosePublic} />
          </ErrorBoundary>
        </QueryProvider>
      </StrictMode>,
    );
  } else {
    root.render(
      <StrictMode>
        <QueryProvider>
          <ErrorBoundary scope="HD-System">
            <App />
          </ErrorBoundary>
        </QueryProvider>
      </StrictMode>,
    );
  }
}

// Initial render
render();

// Listen for hash changes (back/forward navigation)
window.addEventListener('hashchange', render);
