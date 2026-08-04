import 'barcode-detector/pure';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// ─── PWA: registra o service worker para funcionar offline ─────────
// Só em produção: no dev server do Vite o sw.js não faz sentido e pode
// cachear bundles de desenvolvimento. Sem esse registro, abrir o app sem
// internet mostra a tela preta de "off-line" do navegador.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => console.warn('[HD-System] Registro do service worker falhou:', err));
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
