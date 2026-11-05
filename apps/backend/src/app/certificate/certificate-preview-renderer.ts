import { CERTIFICATE_PREVIEW_MAX_BYTES, CERTIFICATE_PREVIEW_MAX_HTML_BYTES } from './certificate-preview-source';

const MAX_SOURCE_DIMENSION = 1600;
const MAX_THUMBNAIL_DIMENSION = 640;

// Match the A4 landscape print layout used by the registered certificate templates.
const VIEWPORT = { width: 1123, height: 794 };

export async function runCertificatePreviewRenderer(): Promise<void> {
  const html = await readTemplate();
  const signal = AbortSignal.timeout(7500);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: true,
    timeout: 4000,
    args: ['--renderer-process-limit=1', '--js-flags=--max-old-space-size=64'],
  });
  const cancel = () => void browser.close().catch(() => undefined);
  signal.addEventListener('abort', cancel, { once: true });
  let screenshot: Buffer;
  try {
    signal.throwIfAborted();
    const page = await browser.newPage({
      viewport: VIEWPORT,
      javaScriptEnabled: false,
      serviceWorkers: 'block',
    });
    await page.route('**/*', (route) => route.abort());
    await page.emulateMedia({ media: 'print', colorScheme: 'light' });
    await page.setContent(html, { waitUntil: 'load', timeout: 4000 });
    const firstPage = page.locator('.certificate-page').first();
    const bounds = await firstPage.boundingBox({ timeout: 1500 });
    if (
      !bounds ||
      bounds.width <= 0 ||
      bounds.height <= 0 ||
      bounds.width > MAX_SOURCE_DIMENSION ||
      bounds.height > MAX_SOURCE_DIMENSION
    ) {
      throw new Error('Certificate template does not have a supported first-page layout.');
    }
    screenshot = await firstPage.screenshot({ type: 'png', animations: 'disabled', timeout: 2500 });
  } finally {
    signal.removeEventListener('abort', cancel);
    await browser.close();
  }

  signal.throwIfAborted();
  const { default: sharp } = await import('sharp');
  sharp.cache(false);
  sharp.concurrency(1);
  const thumbnail = sharp(screenshot, { limitInputPixels: MAX_SOURCE_DIMENSION ** 2 }).resize({
    width: MAX_THUMBNAIL_DIMENSION,
    height: MAX_THUMBNAIL_DIMENSION,
    fit: 'inside',
    withoutEnlargement: true,
  });
  for (const quality of [52, 38]) {
    signal.throwIfAborted();
    const image = await thumbnail.clone().avif({ quality, effort: 2, chromaSubsampling: '4:2:0' }).toBuffer();
    if (image.length <= CERTIFICATE_PREVIEW_MAX_BYTES) {
      signal.throwIfAborted();
      await writeImage(image);
      return;
    }
  }
  throw new Error('Certificate preview could not be encoded within the cache size limit.');
}

async function readTemplate(): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > CERTIFICATE_PREVIEW_MAX_HTML_BYTES) {
      throw new Error('Certificate preview HTML exceeds the rendering limit.');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size).toString('utf8');
}

async function writeImage(image: Buffer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    process.stdout.write(image, (error) => (error ? reject(error) : resolve()));
  });
}
