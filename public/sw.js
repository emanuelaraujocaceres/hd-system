/* HD-System Service Worker — offline-first
 *
 * Estratégia:
 *  - install: pré-cacheia o shell (index.html, manifest, logos). Cada item é
 *    cacheado individualmente para um asset opcional nunca quebrar o install.
 *  - navegação (mode === "navigate"): network-first com fallback ao shell
 *    cacheado. Online sempre entrega o deploy mais novo; offline abre o app.
 *  - /assets/* (bundles com hash do build): cache-first — são imutáveis e são
 *    o código do app; sem eles o app não carrega offline.
 *  - demais GET same-origin: network-first com gravação no cache.
 *  - Requisições cross-origin (ex.: API do Supabase) não passam pelo SW.
 */
const CACHE_NAME = "hd-system-v3";
const SHELL_CACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/logo-hd-system/android-chrome-96x96.png",
  "/logo-hd-system/android-chrome-192x192.png",
  "/logo-hd-system/android-chrome-512x512.png",
  "/logo-hd-system/favicon.ico",
  "/logo-hd-system/favicon-16x16.png",
  "/logo-hd-system/favicon-32x32.png",
  "/logo-hd-system/apple-touch-icon.png",
  "/logo-hd-system/logo-og.png",
  "/logo-hd-system/logo_whatsapp.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        SHELL_CACHE.map((url) =>
          cache.add(url).catch(() => {
            console.warn("[SW] pré-cache falhou:", url);
          })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && (response.ok || response.type === "opaque")) {
    const clone = response.clone();
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.put(request, clone))
      .catch(() => {});
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === "opaque")) {
      const clone = response.clone();
      caches
        .open(CACHE_NAME)
        .then((cache) => cache.put(request, clone))
        .catch(() => {});
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // fallback final para navegação: serve o shell do app
    return caches.match("/index.html");
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});

// ─── Click em notificação: foca a aba aberta (ou abre o app) ───────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) return client.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow('/');
      })
  );
});
