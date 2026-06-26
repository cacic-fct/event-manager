import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });

test.describe('public service worker offline support', () => {
  test('serves the precached CSR shell for offline navigations', async ({ context, page }) => {
    await page.route('**/app/service-worker-offline-probe', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `
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
        `,
      });
    });

    await page.goto('/app/service-worker-offline-probe', { waitUntil: 'domcontentloaded' });

    const serviceWorkerReady = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) {
        return false;
      }

      const registered = await Promise.race([
        (window as Window & { __serviceWorkerProbe?: Promise<boolean> }).__serviceWorkerProbe ?? Promise.resolve(false),
        new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(false), 5000);
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
    });

    // eslint-disable-next-line playwright/no-skipped-test -- This path can only run against the production/static worker build.
    test.skip(!serviceWorkerReady, 'Requires the production/static public build with cacic-public-worker.js available.');

    const cacheState = await page.evaluate(async () => {
      return {
        cacheNames: await caches.keys(),
        hasCsrShell: Boolean(await caches.match('/app/index.csr.html')),
      };
    });

    expect(cacheState.cacheNames.some((cacheName) => cacheName.startsWith('cacic-public-'))).toBe(true);
    expect(cacheState.hasCsrShell).toBe(true);

    await context.setOffline(true);
    const response = await page.goto('/app/offline/service-worker-probe', { waitUntil: 'domcontentloaded' });
    const html = await page.content();

    expect(response?.status()).toBe(200);
    expect(html).toContain('<app-root');
  });
});
