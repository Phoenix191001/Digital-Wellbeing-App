const CACHE = "pause-v12";
const FILES = ["./", "index.html", "styles.css", "app.js", "content.js", "people.js", "study.js", "wellbeing.js", "auth.js", "config.js", "insights.js", "reminders.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "qr.svg"];
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

/* ---------- reminders (Web Push) ---------- */
self.addEventListener("push", e => {
  let m = {}; try { m = e.data ? e.data.json() : {}; } catch { m = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(m.title || "سكون", {
    body: m.body || "", tag: m.tag || "sukoon", icon: "icon-192.png", badge: "icon-192.png", data: { url: m.url || "/" }, renotify: false,
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if ("focus" in c) { c.navigate ? c.navigate(url).catch(() => {}) : null; return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
