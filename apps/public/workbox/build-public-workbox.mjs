import { rm, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { copyWorkboxLibraries, injectManifest } from 'workbox-build';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const browserDirectory = join(workspaceRoot, 'dist/apps/public/browser');
const workerSource = join(workspaceRoot, 'apps/public/workbox/cacic-public-worker.js');
const preparedWorkerSource = join(browserDirectory, 'cacic-public-worker.source.js');
const workerDestination = join(browserDirectory, 'cacic-public-worker.js');

const workboxDirectory = await copyWorkboxLibraries(browserDirectory);
const source = await readFile(workerSource, 'utf8');
await writeFile(preparedWorkerSource, source.replaceAll('__WORKBOX_LIBRARY_DIRECTORY__', workboxDirectory));

try {
  const result = await injectManifest({
    swSrc: preparedWorkerSource,
    swDest: workerDestination,
    globDirectory: browserDirectory,
    globPatterns: [
      '*.js',
      '*.css',
      'index.html',
      'index.csr.html',
      'assets/**/*.{svg,cur,jpg,jpeg,png,apng,webp,avif,gif,otf,ttf,woff,woff2}',
      'icons/**/*.{png,webp}',
      'media/**/*.{svg,cur,jpg,jpeg,png,apng,webp,avif,gif,otf,ttf,woff,woff2}',
    ],
    globIgnores: [
      '**/*.map',
      'mockServiceWorker.js',
      'cacic-public-worker.js',
      'cacic-public-worker.source.js',
      'ngsw-worker.js',
      'ngsw.json',
      'novu-ngsw-worker.js',
      'novu-ngsw-worker.source.js',
      'novu-push-handler.js',
      'safety-worker.js',
      'worker-basic.min.js',
      `${workboxDirectory}/**/*`,
    ],
    dontCacheBustURLsMatching: /-[a-zA-Z0-9]{8,}\./,
    maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
    modifyURLPrefix: {
      '': '/app/',
    },
  });

  for (const warning of result.warnings) {
    console.warn(warning);
  }

  console.info(`Generated Workbox service worker with ${result.count} precached files.`);
} finally {
  await rm(preparedWorkerSource, { force: true });
}
