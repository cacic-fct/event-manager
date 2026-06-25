import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { basename, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appRoutes } from './app/app.routes';

// Sitemap
import { collectPaths } from '@cacic-fct/shared-angular';
import xmlbuilder from 'xmlbuilder';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');
const turnstileSiteKeyMetaName = 'cacic-turnstile-site-key';
const turnstileSiteKey = process.env['TURNSTILE_SITE_KEY']?.trim() ?? '';

const app = express();
const angularApp = new AngularNodeAppEngine({
  allowedHosts: ['eventos.cacic.dev.br'],
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
app.use(
  '/app',
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
    setHeaders: (res, path) => {
      const fileName = basename(path);
      const extension = extname(path);

      if (fileName === 'cacic-public-worker.js' || fileName === 'novu-ngsw-worker.js') {
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.setHeader('CDN-Cache-Control', 'no-store');
        res.setHeader('Service-Worker-Allowed', '/app/');
        return;
      }

      if (fileName === 'novu-push-handler.js' || fileName === 'manifest.webmanifest' || extension === '.html') {
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.setHeader('CDN-Cache-Control', 'no-store');
      }
    },
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use('/{*splat}', (req, res, next) => {
  angularApp
    .handle(req)
    .then(async (response) => {
      if (!response) {
        next();
        return;
      }

      const configuredResponse =
        turnstileSiteKey && isHtmlResponse(response) ? await injectTurnstileSiteKey(response) : response;
      writeResponseToNodeResponse(configuredResponse, res);
    })
    .catch(next);
});

app.get('/app/sitemap.xml', (req, res) => {
  const routes = Array.from(new Set(collectPaths(appRoutes)));

  const root = xmlbuilder.create('urlset', {
    version: '1.0',
    encoding: 'UTF-8',
  });
  root.att('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9');

  routes.forEach((route) => {
    const path = route.startsWith('/') ? route : `/${route}`;
    // Skip dynamic routes with parameters
    if (path.includes(':')) {
      return;
    }
    const url = root.ele('url');
    url.ele('loc', `https://eventos.cacic.dev.br/app${path}`);
  });

  res.type('application/xml; charset=utf-8');
  res.send(root.end({ pretty: true }));
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  validateServerEnvironment();
  const port = process.env['PORT'] || 4000;
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);

function isHtmlResponse(response: Response): boolean {
  return (response.headers.get('content-type') ?? '').includes('text/html');
}

async function injectTurnstileSiteKey(response: Response): Promise<Response> {
  const html = await response.text();
  const headers = new Headers(response.headers);
  headers.delete('content-length');

  return new Response(addTurnstileSiteKeyMeta(html), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function addTurnstileSiteKeyMeta(html: string): string {
  if (html.includes(`name="${turnstileSiteKeyMetaName}"`)) {
    return html;
  }

  const meta = `<meta name="${turnstileSiteKeyMetaName}" content="${escapeHtmlAttribute(turnstileSiteKey)}" />`;
  return html.replace('</head>', `    ${meta}\n  </head>`);
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function validateServerEnvironment(): void {
  if (process.env['NODE_ENV'] === 'production' && !turnstileSiteKey) {
    throw new Error('TURNSTILE_SITE_KEY must be set for the production public app server.');
  }
}
