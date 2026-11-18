/* Service worker: cache the shell only. Never cache d/ or /api/. No secrets. */
const VER = "desk-shell-v1";
const SHELL = ["./","index.html","app.css","app.js","chart.js","format.js","decrypt.js","manifest.json",
  "icons/icon-192.png","icons/icon-512.png","icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VER).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VER).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.pathname.includes("/d/") || u.pathname.includes("/api/")) return;
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = { body: e.data && e.data.text() }; }
  const title = data.title || "Grok Bot · now";
  const body = data.body || "";
  if (!body) return;
  e.waitUntil(self.registration.showNotification(title, { body, data }));
});
