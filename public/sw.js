const CACHE_NAME = "hd-system-v1";
const ASSETS_TO_CACHE = [
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
  "/logo-hd-system/logo-og.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

