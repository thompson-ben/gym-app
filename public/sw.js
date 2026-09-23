/*
 * Splitmate service worker.
 *
 * Deliberately conservative: it never caches authenticated pages, RSC payloads or API
 * responses, so nothing private can leak between accounts on a shared device. It only
 * caches the static /offline shell and immutable build assets, so a workout that was
 * already open can be recovered from this device's local storage after a reload without
 * a connection.
 */
const CACHE = "splitmate-shell-v1";
const SHELL = "/offline";

async function cacheShell() {
  const cache = await caches.open(CACHE);
  const response = await fetch(SHELL, { cache: "no-store", credentials: "omit" });
  if (!response.ok) return;
  const html = await response.clone().text();
  await cache.put(SHELL, response);
  const assets = new Set(["/manifest.webmanifest", "/icons/icon-192.png"]);
  for (const match of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) assets.add(match[1]);
  await Promise.all(
    [...assets].map((url) =>
      fetch(url).then((r) => (r.ok ? cache.put(url, r) : undefined)).catch(() => undefined),
    ),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Immutable, content-hashed build assets and icons: cache first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  // Page navigations always go to the network. Only when that fails is the static offline
  // shell served, which renders from this device's own local workout data.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE);
        if (url.pathname !== SHELL) {
          const match = url.pathname.match(/^\/workout\/([0-9a-f-]{36})$/i);
          return Response.redirect(match ? `${SHELL}?session=${match[1]}` : SHELL, 302);
        }
        return (await cache.match(SHELL)) ?? new Response("You are offline.", { status: 503, headers: { "Content-Type": "text/plain" } });
      }),
    );
  }
});
