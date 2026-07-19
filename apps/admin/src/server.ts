import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import { applyCspToHtmlResponse } from '@cacic-fct/shared-utils';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine({
  allowedHosts: ['eventos.cacic.com.br'],
  trustProxyHeaders: [
    'x-forwarded-host',
    'x-forwarded-proto',
    'cf-connecting-ip',
    'x-forwarded-server',
    'x-forwarded-for',
    'x-forwarded-port',
  ],
});

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/**', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/**
 * Serve static files from /browser
 */
app.get(['/admin/index.html', '/admin/index.csr.html'], async (req, res, next) => {
  try {
    const html = await readFile(join(browserDistFolder, basename(req.path)), 'utf8');
    writeResponseToNodeResponse(
      await applyCspToHtmlResponse(
        new Response(html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
        adminCspPolicy,
      ),
      res,
    );
  } catch (error) {
    next(error);
  }
});

app.use(
  '/admin',
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use('/{*splat}', (req, res, next) => {
  angularApp
    .handle(req)
    .then(async (response) =>
      response ? writeResponseToNodeResponse(await applyCspToHtmlResponse(response, adminCspPolicy), res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);

function adminCspPolicy(nonce: string): string {
  return [
    "base-uri 'self'",
    "default-src 'self'",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval' https://a.cacic.com.br https://static.cloudflareinsights.com`,
    "script-src-attr 'none'",
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob: https://cdn.jsdelivr.net https://lh3.googleusercontent.com",
    "font-src 'self' data:",
    "connect-src 'self' https://a.cacic.com.br https://account.cacic.com.br https://cdn.jsdelivr.net https://fastly.jsdelivr.net https://glitchtip.cacic.com.br https://notifications.cacic.com.br https://unleash.cacic.com.br https://cloudflareinsights.com",
    'report-uri https://glitchtip.cacic.com.br/api/2/security/?glitchtip_key=b787190b5ac546eb867e793b84d2b4b2',
    "frame-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'trusted-types angular angular#bundler angular#unsafe-bypass default cacic#external-script',
    "require-trusted-types-for 'script'",
    'upgrade-insecure-requests',
  ].join('; ');
}
