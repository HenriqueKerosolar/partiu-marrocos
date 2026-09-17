// PM-CONV-05, Track B — service worker mínimo, real (não um stub vazio).
// Estratégia deliberada, dado que o app é autenticado e dinâmico por
// natureza (cada página depende de cookie/sessão e dado por tenant):
// - Assets estáticos do Next (_next/static/*) e o ícone/manifest: cache-first
//   (nunca mudam de conteúdo pra uma mesma URL com hash, seguro cachear).
// - Todo o resto (páginas, API, server actions): NUNCA cacheado — vai
//   sempre à rede. Cachear HTML/JSON autenticado seria exatamente o "cache
//   inseguro de dado sensível" que o comando proíbe.
// - Fallback offline só para navegação (troca de página) quando a rede
//   falha — nunca para POST/mutação.
const CACHE_NAME = "pm-shell-v2"; // v2 — PM-CONV-06: ícones PNG (180/192/512) entraram no precache, junto do SVG
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL, "/icon.svg", "/icon-180.png", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== "GET") return; // nunca intercepta mutação

  const ASSETS_ESTATICOS = new Set(["/icon.svg", "/icon-180.png", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"]);
  if (url.pathname.startsWith("/_next/static/") || ASSETS_ESTATICOS.has(url.pathname)) {
    event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request)));
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
  }
});
