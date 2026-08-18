import { expect, test } from './support/e2e-test';
import { createServer, request as requestHttp } from 'node:http';
import { request as requestHttps } from 'node:https';
import type { AddressInfo } from 'node:net';

const serviceWorkerProbePath = '/app/service-worker-offline-probe';
// Firefox on CI can need several seconds to install the full production precache before `ready` resolves.
const serviceWorkerReadyTimeoutMs = 30_000;

const serviceWorkerProbeHtml = `
  <!doctype html>
  <meta charset="utf-8">
  <title>Service Worker Offline Probe</title>
  <script>
    window.__serviceWorkerProbe = navigator.serviceWorker
      .register('/app/cacic-public-worker.js', { scope: '/app/', updateViaCache: 'none' })
      .then(() => navigator.serviceWorker.ready)
      .then(() => true)
      .catch(() => false);
  </script>
`;

const requireBaseURL = (baseURL: string | undefined) => {
  if (!baseURL) {
    throw new Error('The service-worker e2e project requires a baseURL.');
  }
  return baseURL;
};

const startStaticBuildProxy = async (upstreamBaseURL: string) => {
  const upstreamOrigin = new URL(upstreamBaseURL);
  const requestUpstream = upstreamOrigin.protocol === 'https:' ? requestHttps : requestHttp;
  const server = createServer((request, response) => {
    if (request.url === serviceWorkerProbePath) {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(serviceWorkerProbeHtml);
      return;
    }

    const requestedURL = new URL(request.url ?? '/', 'http://static-build-proxy');
    const upstreamPath =
      requestedURL.pathname === '/app' || requestedURL.pathname.startsWith('/app/')
        ? requestedURL.pathname.slice('/app'.length) || '/'
        : requestedURL.pathname;
    const upstreamPathWithSearch = `${upstreamPath}${requestedURL.search}`;
    const upstreamRequest = requestUpstream(
      {
        protocol: upstreamOrigin.protocol,
        hostname: upstreamOrigin.hostname,
        port: upstreamOrigin.port || undefined,
        path: upstreamPathWithSearch,
        method: request.method,
        headers: { ...request.headers, host: upstreamOrigin.host },
      },
      (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        upstreamResponse.pipe(response);
      },
    );

    upstreamRequest.on('error', () => {
      if (!response.headersSent) {
        response.writeHead(502);
      }
      response.end();
    });
    request.pipe(upstreamRequest);
  });

  await new Promise<void>((resolve, reject) => {
    const handleError = (error: Error) => reject(error);
    server.once('error', handleError);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', handleError);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  let closePromise: Promise<void> | undefined;
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => {
      closePromise ??= new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
      return closePromise;
    },
  };
};

test.use({ serviceWorkers: 'allow' });

test.describe('public service worker offline support', () => {
  // eslint-disable-next-line playwright/no-skipped-test -- The development server does not emit the production worker.
  test.skip(
    process.env['E2E_PUBLIC_STATIC_SERVER'] !== 'true',
    'Requires E2E_PUBLIC_STATIC_SERVER=true and the production/static public build.',
  );

  test('serves the precached CSR shell for offline navigations', async ({ baseURL, page }) => {
    const staticBuildProxy = await startStaticBuildProxy(requireBaseURL(baseURL));

    try {
      await page.goto(`${staticBuildProxy.origin}${serviceWorkerProbePath}`, { waitUntil: 'domcontentloaded' });

      const serviceWorkerReady = await page.evaluate(async (readyTimeoutMs) => {
        if (!('serviceWorker' in navigator)) {
          return false;
        }

        const registered = await Promise.race([
          (window as Window & { __serviceWorkerProbe?: Promise<boolean> }).__serviceWorkerProbe ??
            Promise.resolve(false),
          new Promise<boolean>((resolve) => {
            setTimeout(() => resolve(false), readyTimeoutMs);
          }),
        ]);

        if (!registered) {
          return false;
        }

        if (navigator.serviceWorker.controller) {
          return true;
        }

        return await Promise.race([
          new Promise<boolean>((resolve) => {
            navigator.serviceWorker.addEventListener('controllerchange', () => resolve(true), { once: true });
          }),
          new Promise<boolean>((resolve) => {
            setTimeout(() => resolve(Boolean(navigator.serviceWorker.controller)), 5000);
          }),
        ]);
      }, serviceWorkerReadyTimeoutMs);

      expect(
        serviceWorkerReady,
        'The production/static public build must register and activate cacic-public-worker.js.',
      ).toBe(true);

      const cacheState = await page.evaluate(async () => {
        return {
          cacheNames: await caches.keys(),
          hasCsrShell: Boolean(await caches.match('/app/index.csr.html', { ignoreSearch: true })),
        };
      });

      expect(cacheState.cacheNames.some((cacheName) => cacheName.startsWith('cacic-public-'))).toBe(true);
      expect(cacheState.hasCsrShell).toBe(true);

      await staticBuildProxy.close();

      const response = await page.goto(`${staticBuildProxy.origin}/app/offline/service-worker-probe`, {
        waitUntil: 'commit',
      });

      expect(response?.status()).toBe(200);
      expect(await response?.text()).toContain('<app-root');
    } finally {
      await staticBuildProxy.close();
    }
  });
});
