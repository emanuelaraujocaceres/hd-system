import 'barcode-detector/pure';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { PublicMenuView } from './components/CardapioDigital/PublicMenuView.tsx';
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
// URLs públicas: #/mesa/{token} ou /#/mesa/{token}
function getPublicRoute(): { type: 'menu'; token: string } | null {
  const hash = window.location.hash;
  const match = hash.match(/^#\/mesa\/(.+)$/);
  if (match) {
    try {
      return { type: 'menu', token: decodeURIComponent(match[1]) };
    } catch {
      return { type: 'menu', token: match[1] };
    }
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
        <PublicMenuView tableToken={route.token} onClose={handleClosePublic} />
      </StrictMode>,
    );
  } else {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  }
}

// Initial render
render();

// Listen for hash changes (back/forward navigation)
window.addEventListener('hashchange', render);
