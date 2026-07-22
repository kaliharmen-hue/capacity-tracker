const CACHE_NAME = "personal-operating-system-v2";

function appUrl(path) {
  return new URL(path, self.registration.scope).href;
}

const APP_SHELL = [
  appUrl("./"),
  appUrl("history/"),
  appUrl("insights/"),
  appUrl("pmdd/"),
  appUrl("experiments/"),
  appUrl("export/"),
  appUrl("manifest.webmanifest"),
  appUrl("icons/icon-192.svg"),
  appUrl("icons/icon-512.svg")
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of APP_SHELL) {
        try {
          await cache.add(url);
        } catch {
          // One missing optional asset should not prevent the app from loading.
        }
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") return caches.match(appUrl("./"));
        return new Response("", { status: 503, statusText: "Offline" });
      })
  );
});
