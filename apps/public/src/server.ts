import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import { applyCspToHtmlResponse } from '@cacic-fct/shared-utils';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appRoutes } from './app/app.routes';

// Sitemap
import { collectPaths } from '@cacic-fct/shared-angular';
import xmlbuilder from 'xmlbuilder';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');
const turnstileSiteKeyMetaName = 'cacic-turnstile-site-key';
const turnstileSiteKey = process.env['TURNSTILE_SITE_KEY']?.trim() ?? '';
const publicAppVersion = 'APP_VERSION_PLACEHOLDER';

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

app.get('/app/api/version', (_req, res) => {
  res.set({
    'Cache-Control': 'no-store, max-age=0',
    'CDN-Cache-Control': 'no-store',
  });
  res.json({ version: publicAppVersion });
});

/**
 * Serve static files from /browser
 */
app.use(
  '/app/.well-known',
  express.static(join(browserDistFolder, '.well-known'), {
    dotfiles: 'allow',
    index: false,
    redirect: false,
    maxAge: '1y',
  }),
);

app.get(['/app/index.html', '/app/index.csr.html'], async (req, res, next) => {
  try {
    const html = await readFile(join(browserDistFolder, basename(req.path)), 'utf8');
    writeResponseToNodeResponse(
      await applyCspToHtmlResponse(
        new Response(html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
        publicCspPolicy,
        addTurnstileSiteKeyMeta,
      ),
      res,
    );
  } catch (error) {
    next(error);
  }
});

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

      const configuredResponse = isHtmlResponse(response)
        ? await applyCspToHtmlResponse(response, publicCspPolicy, addTurnstileSiteKeyMeta)
        : response;
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
    url.ele('loc', `https://eventos.cacic.com.br/app${path}`);
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

function addTurnstileSiteKeyMeta(html: string): string {
  if (html.includes(`name="${turnstileSiteKeyMetaName}"`)) {
    return html;
  }

  const meta = `<meta name="${turnstileSiteKeyMetaName}" content="${escapeHtmlAttribute(turnstileSiteKey)}" />`;
  return html.replace('</head>', `    ${meta}\n  </head>`);
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function validateServerEnvironment(): void {
  if (process.env['NODE_ENV'] === 'production' && !turnstileSiteKey) {
    throw new Error('TURNSTILE_SITE_KEY must be set for the production public app server.');
  }
}

function publicCspPolicy(nonce: string): string {
  return [
    "base-uri 'self'",
    "default-src 'self'",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval' https://a.cacic.com.br https://challenges.cloudflare.com https://static.cloudflareinsights.com`,
    "script-src-attr 'none'",
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob: https://cdn.jsdelivr.net https://lh3.googleusercontent.com https://tile.openstreetmap.org https://notifications.cacic.dev.br",
    "font-src 'self' data:",
    "connect-src 'self' https://a.cacic.com.br https://account.cacic.com.br https://cdn.jsdelivr.net https://fastly.jsdelivr.net https://glitchtip.cacic.com.br https://notifications.cacic.com.br wss://notifications.cacic.com.br https://unleash.cacic.com.br https://cloudflareinsights.com",
    'report-uri https://glitchtip.cacic.com.br/api/1/security/?glitchtip_key=44b2480fd6cd4402b61590135a093fd6',
    "frame-src 'self' https://challenges.cloudflare.com https://www.youtube-nocookie.com",
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
