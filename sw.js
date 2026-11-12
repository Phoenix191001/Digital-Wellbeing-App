const CACHE = "pause-v11";
const FILES = ["./", "index.html", "styles.css", "app.js", "content.js", "people.js", "study.js", "wellbeing.js", "auth.js", "config.js", "insights.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "qr.svg"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  if (u.origin !== self.location.origin) return; // Supabase etc: always live, never cached
  if (u.pathname.startsWith("/api/") || u.pathname.endsWith("community-links.json")) return; // always live
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
    const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res;
  }).catch(() => caches.match("index.html"))));
});
