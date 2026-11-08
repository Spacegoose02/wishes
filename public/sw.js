// Wishes service worker: phone and desktop alerts, and lists you've opened stay readable
// offline (say, in a store with no signal).

const PAGES = "wishes-pages-v1";
const STATIC = "wishes-static-v1";
// Pages worth keeping a copy of: home, lists, family lists and your shopping.
const KEEP = /^\/($|lists\/\d+\/?$|shared\/?$|purchases\/?$)/;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.add("/offline.html")).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("wishes-") && k !== PAGES && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "signed-out") event.waitUntil(caches.delete(PAGES));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Built files never change once published, so the first copy is good forever.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(STATIC).then((c) => c.put(req, copy));
        }
        return res;
      })),
    );
    return;
  }

  if (req.mode !== "navigate") return;
  // Signing out (or landing on the sign-in page) forgets the saved pages.
  if (url.pathname.startsWith("/login")) caches.delete(PAGES);
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && !res.redirected && !url.search && KEEP.test(url.pathname) && (res.headers.get("content-type") || "").includes("text/html")) {
          const copy = res.clone();
          caches.open(PAGES).then((c) => c.put(url.pathname, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(url.pathname, { cacheName: PAGES })) || (await caches.match("/offline.html")) || Response.error()),
  );
});

self.addEventListener("push", (event) => {
  let msg = { title: "Wishes", body: "", url: "/notifications" };
  try {
    msg = { ...msg, ...event.data.json() };
  } catch {
    if (event.data) msg.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      tag: msg.tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: msg.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) return open.navigate(url).then((w) => (w || open).focus());
      return self.clients.openWindow(url);
    }),
  );
});
