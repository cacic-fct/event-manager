import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { CERTIFICATE_PREVIEW_MAX_BYTES, CERTIFICATE_PREVIEW_MAX_HTML_BYTES } from './certificate-preview-source';

const execFile = promisify(execFileCallback);
const MAX_THUMBNAIL_DIMENSION = 640;
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const MAX_PNG_BYTES = MAX_THUMBNAIL_DIMENSION ** 2 * 4 + 64 * 1024;

// Match the A4 landscape print layout used by the registered certificate templates.
const VIEWPORT = { width: 1123, height: 794 };

export async function runCertificatePreviewRenderer(): Promise<void> {
  await writeImage(await renderCertificatePreview(await readTemplate()));
}

export async function renderCertificatePreview(html: string): Promise<Buffer> {
  if (Buffer.byteLength(html) > CERTIFICATE_PREVIEW_MAX_HTML_BYTES) {
    throw new Error('Certificate preview HTML exceeds the rendering limit.');
  }
  const signal = AbortSignal.timeout(7500);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: true,
    timeout: 4000,
    args: ['--renderer-process-limit=1', '--js-flags=--max-old-space-size=64'],
  });
  const cancel = () => void browser.close().catch(() => undefined);
  signal.addEventListener('abort', cancel, { once: true });
  let pdf: Buffer;
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
    await page.evaluate(() => document.fonts.ready);
    // Use the download's print settings so @page sizing and page breaks are
    // reflected in the preview, including templates without .certificate-page.
    pdf = await page.pdf({ format: 'A4', printBackground: true, pageRanges: '1' });
    if (pdf.length > MAX_PDF_BYTES) {
      throw new Error('Certificate preview PDF exceeds the rendering limit.');
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    await browser.close();
  }

  signal.throwIfAborted();
  const raster = execFile(
    'pdftoppm',
    ['-q', '-f', '1', '-l', '1', '-singlefile', '-scale-to', String(MAX_THUMBNAIL_DIMENSION), '-png', '-'],
    { encoding: 'buffer', signal, timeout: 2500, killSignal: 'SIGKILL', maxBuffer: MAX_PNG_BYTES },
  );
  raster.child.stdin?.on('error', () => {
    // A failed rasterizer can close its input before the PDF write completes.
  });
  raster.child.stdin?.end(pdf);
  const { stdout: png } = await raster;

  signal.throwIfAborted();
  const { default: sharp } = await import('sharp');
  sharp.cache(false);
  sharp.concurrency(1);
  const thumbnail = sharp(png, { limitInputPixels: MAX_THUMBNAIL_DIMENSION ** 2 }).resize({
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
      return image;
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
