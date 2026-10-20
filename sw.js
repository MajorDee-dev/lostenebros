/* Los Ténébros : service worker (hors ligne).
   - L'appli (index.html), le manifest et les icônes : cache d'abord, puis mise à jour en arrière-plan
     (la nouvelle version s'affiche à l'ouverture suivante).
   - Le SDK Firebase (gstatic), les polices Google et les bibliothèques des CDN (three.js) : cache d'abord.
   - Jamais la base Firestore elle-même (firestore.googleapis.com) : le SDK gère ses écritures en attente.
   Changer VERSION à chaque déploiement qui modifie ce fichier : les anciens caches sont effacés. */
const VERSION = "lt-2026-10-20-a";
const APP = VERSION + "-app";
const LIBS = "lt-libs-1"; // URLs versionnées (firebasejs/10.12.2, three r128…) : gardées d'une version à l'autre
const CORE = ["./", "index.html", "manifest.json", "icon.svg", "apple-touch-icon.png", "icon-512.png"];
const LIB_RE = /^https:\/\/(www\.gstatic\.com\/firebasejs\/|fonts\.googleapis\.com\/|fonts\.gstatic\.com\/|cdnjs\.cloudflare\.com\/|cdn\.jsdelivr\.net\/|unpkg\.com\/)/;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(APP).then(c => Promise.all(CORE.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== APP && k !== LIBS).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function fromNet(req, cacheName, key) {
  return fetch(req).then(res => {
    if (res && (res.ok || res.type === "opaque")) { const copy = res.clone(); caches.open(cacheName).then(c => c.put(key || req, copy)).catch(() => {}); }
    return res;
  });
}
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    // la page : une seule entrée (index.html), quel que soit le #lien ou le ?paramètre
    const isPage = req.mode === "navigate" || /\/(index\.html)?$/.test(url.pathname);
    const key = isPage ? new URL("index.html", self.registration.scope).href : req;
    e.respondWith(caches.open(APP).then(c => c.match(key, { ignoreSearch: isPage }).then(hit => {
      const net = fromNet(req, APP, key).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; } // cache d'abord, mise à jour derrière
      return net.then(res => res || (isPage ? c.match(key, { ignoreSearch: true }) : null)).then(res => res || new Response("Hors ligne", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }));
    })));
    return;
  }
  if (LIB_RE.test(req.url)) {
    e.respondWith(caches.open(LIBS).then(c => c.match(req).then(hit => hit || fromNet(req, LIBS))).catch(() => fetch(req)));
  }
});
