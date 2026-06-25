/* global caches, importScripts, Response, self, workbox */

// Keep Novu push handling in the same registered Service Worker.
importScripts('./novu-push-handler.js');
importScripts('./__WORKBOX_LIBRARY_DIRECTORY__/workbox-sw.js');

workbox.setConfig({
  modulePathPrefix: './__WORKBOX_LIBRARY_DIRECTORY__/',
});

workbox.core.setCacheNameDetails({
  prefix: 'cacic-public',
});

workbox.precaching.precacheAndRoute(self.__WB_MANIFEST, {
  ignoreURLParametersMatching: [/^utm_/, /^fbclid$/],
});
workbox.precaching.cleanupOutdatedCaches();
workbox.core.clientsClaim();

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(skipWaitingForTrustedClient(event));
    return;
  }

  if (event.data?.type === 'CACHE_ATTENDANCE_SCANNER') {
    event.waitUntil(cacheAttendanceScannerUrlsForClient(event));
  }
});

async function cacheAttendanceScannerUrlsForClient(event) {
  const ok = await cacheAttendanceScannerUrls(event.data.urls);
  event.ports?.[0]?.postMessage({
    type: 'CACHE_ATTENDANCE_SCANNER_RESULT',
    ok,
  });
}

async function skipWaitingForTrustedClient(event) {
  if (!event.source?.id) {
    return;
  }

  const client = await self.clients.get(event.source.id);
  if (!client || new URL(client.url).origin !== self.location.origin) {
    return;
  }

  await self.skipWaiting();
}

const scopePath = new URL(self.registration.scope).pathname;
const appScopePath = scopePath.endsWith('/') ? scopePath : `${scopePath}/`;
const appShellUrl = `${appScopePath}index.csr.html`;

const sameOrigin = (url) => url.origin === self.location.origin;
const isApiPath = (url) => url.pathname.startsWith('/api/');
const isAuthPath = (url) =>
  url.pathname.startsWith('/api/auth/') ||
  url.pathname.includes('/login') ||
  url.pathname.includes('/logout') ||
  url.pathname.includes('/callback');
const isGraphqlPath = (url) => url.pathname === '/api/graphql';
const isCertificateDownload = (url) =>
  url.pathname.toLowerCase().includes('certificate') || url.pathname.toLowerCase().endsWith('.pdf');
const isZxingWasmUrl = (url) =>
  ['https://fastly.jsdelivr.net', 'https://cdn.jsdelivr.net'].includes(url.origin) &&
  /^\/npm\/zxing-wasm@[^/]+\/dist\/full\/zxing_full\.wasm$/.test(url.pathname);
const hasPrivateCacheControl = (response) => {
  const cacheControl = response.headers.get('Cache-Control')?.toLowerCase() ?? '';
  return cacheControl.includes('no-store') || cacheControl.includes('private');
};
const zxingWasmCacheName = 'zxing-wasm';
const zxingWasmExpirationConfig = {
  maxEntries: 4,
  maxAgeSeconds: 60 * 60 * 24 * 30,
};

const networkOnly = new workbox.strategies.NetworkOnly();
const cacheableHtmlPlugin = {
  cacheWillUpdate: async ({ response }) => {
    if (response.status !== 200) {
      return null;
    }

    if (hasPrivateCacheControl(response)) {
      return null;
    }

    const contentType = response.headers.get('Content-Type')?.toLowerCase() ?? '';
    return contentType.includes('text/html') ? response : null;
  },
};
const cacheableStaticMediaPlugin = {
  cacheWillUpdate: async ({ response }) => {
    if (![0, 200].includes(response.status) || hasPrivateCacheControl(response)) {
      return null;
    }

    return response;
  },
};
const ssrNavigationStrategy = new workbox.strategies.NetworkFirst({
  cacheName: 'ssr-html',
  networkTimeoutSeconds: 3,
  plugins: [
    cacheableHtmlPlugin,
    new workbox.expiration.ExpirationPlugin({
      maxEntries: 30,
      maxAgeSeconds: 60 * 60 * 24,
      purgeOnQuotaError: true,
    }),
  ],
});

for (const method of ['GET', 'POST']) {
  workbox.routing.registerRoute(
    ({ url }) => sameOrigin(url) && (isAuthPath(url) || isGraphqlPath(url) || isCertificateDownload(url)),
    networkOnly,
    method,
  );
}

workbox.routing.registerRoute(
  ({ request, url }) => request.mode === 'navigate' && sameOrigin(url) && !isApiPath(url) && !isAuthPath(url),
  async (options) => {
    try {
      return await ssrNavigationStrategy.handle(options);
    } catch {
      return appShellFallback();
    }
  },
);

workbox.routing.setCatchHandler(({ request }) => {
  if (request.mode === 'navigate') {
    return appShellFallback();
  }

  return Response.error();
});

workbox.routing.registerRoute(
  ({ url }) => sameOrigin(url) && url.pathname === `${appScopePath}manifest.webmanifest`,
  new workbox.strategies.NetworkFirst({
    cacheName: 'manifest',
    networkTimeoutSeconds: 3,
    plugins: [
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 2,
        maxAgeSeconds: 60 * 60 * 24 * 7,
      }),
    ],
  }),
);

workbox.routing.registerRoute(
  ({ request, url }) =>
    sameOrigin(url) && !isApiPath(url) && (request.destination === 'image' || request.destination === 'font'),
  new workbox.strategies.CacheFirst({
    cacheName: 'static-media',
    plugins: [
      cacheableStaticMediaPlugin,
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 120,
        maxAgeSeconds: 60 * 60 * 24 * 30,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

workbox.routing.registerRoute(
  ({ request, url }) => request.method === 'GET' && isZxingWasmUrl(url),
  new workbox.strategies.CacheFirst({
    cacheName: zxingWasmCacheName,
    plugins: [
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new workbox.expiration.ExpirationPlugin({
        ...zxingWasmExpirationConfig,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

async function appShellFallback() {
  const precachedResponse = await workbox.precaching.matchPrecache(appShellUrl);
  if (precachedResponse) {
    return precachedResponse;
  }

  const cachedResponse = await caches.match(appShellUrl);
  return cachedResponse ?? Response.error();
}

async function cacheAttendanceScannerUrls(urls) {
  if (!Array.isArray(urls)) {
    return false;
  }

  const results = await Promise.allSettled(
    urls
      .filter((url) => typeof url === 'string')
      .map((url) => cacheAttendanceScannerUrl(url)),
  );
  return results.every((result) => result.status === 'fulfilled' && result.value);
}

async function cacheAttendanceScannerUrl(rawUrl) {
  const url = new URL(rawUrl, self.location.origin);
  if (!sameOrigin(url) && !isZxingWasmUrl(url)) {
    return false;
  }

  const request = new Request(url.toString(), {
    credentials: sameOrigin(url) ? 'same-origin' : 'omit',
    mode: sameOrigin(url) ? 'same-origin' : 'cors',
  });
  const response = await fetch(request);
  if (!response || ![0, 200].includes(response.status) || hasPrivateCacheControl(response)) {
    return false;
  }

  const cacheName = sameOrigin(url) ? 'ssr-html' : zxingWasmCacheName;
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  if (cacheName === zxingWasmCacheName) {
    const expiration = new workbox.expiration.CacheExpiration(cacheName, zxingWasmExpirationConfig);
    await expiration.updateTimestamp(request.url);
  }
  return true;
}

self.addEventListener('notificationclick', (event) => {
  const url = event.notification.data?.url;
  event.notification.close();
  if (typeof url !== 'string') {
    return;
  }

  event.waitUntil(openTrustedClientUrl(url));
});

async function openTrustedClientUrl(rawUrl) {
  const url = new URL(rawUrl, self.location.origin);
  if (!sameOrigin(url)) {
    return;
  }

  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existing = clients.find((client) => new URL(client.url).pathname === url.pathname);
  if (existing) {
    await existing.focus();
    return;
  }

  await self.clients.openWindow(url.toString());
}
