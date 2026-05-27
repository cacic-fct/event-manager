/* global importScripts, Response, self, workbox */

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

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(skipWaitingForTrustedClient(event));
  }
});

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

const networkOnly = new workbox.strategies.NetworkOnly();
const cacheableHtmlPlugin = {
  cacheWillUpdate: async ({ response }) => {
    if (response.status !== 200) {
      return null;
    }

    const cacheControl = response.headers.get('Cache-Control')?.toLowerCase() ?? '';
    if (cacheControl.includes('no-store') || cacheControl.includes('private')) {
      return null;
    }

    const contentType = response.headers.get('Content-Type')?.toLowerCase() ?? '';
    return contentType.includes('text/html') ? response : null;
  },
};

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
      const response = await workbox.precaching.matchPrecache(appShellUrl);
      if (response) {
        return response;
      }

      return Response.error();
    }
  },
);

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
    sameOrigin(url) && (request.destination === 'image' || request.destination === 'font'),
  new workbox.strategies.CacheFirst({
    cacheName: 'static-media',
    plugins: [
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 120,
        maxAgeSeconds: 60 * 60 * 24 * 30,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);
