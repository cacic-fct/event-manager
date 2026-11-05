import { jest as jestEsm } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { createCertificatePdfFixture } from './certificate-pdf.fixtures';
import { CERTIFICATE_PREVIEW_MAX_BYTES, CERTIFICATE_PREVIEW_MAX_HTML_BYTES } from './certificate-preview-source';

const { jest } = import.meta;

jestEsm.unstable_mockModule('playwright', () => ({ chromium: { launch: jest.fn() } }));
const { chromium } = await import('playwright');
const { renderCertificatePreview } = await import('./certificate-preview-renderer');
const popplerMissing = spawnSync('pdftoppm', ['-v']).error?.code === 'ENOENT';
const testWithPoppler = popplerMissing && !process.env.CI ? it.skip : it;

function mockBrowser(pdf: Buffer) {
  const page = {
    route: jest.fn(),
    emulateMedia: jest.fn(),
    setContent: jest.fn(),
    evaluate: jest.fn(),
    pdf: jest.fn().mockResolvedValue(pdf),
  };
  const browser = { newPage: jest.fn().mockResolvedValue(page), close: jest.fn().mockResolvedValue(undefined) };
  jest.mocked(chromium.launch).mockResolvedValue(browser as never);
  return { page, browser };
}

beforeEach(() => jest.mocked(chromium.launch).mockReset());

testWithPoppler('rasterizes only the first PDF page into a bounded AVIF preview', async () => {
  const { page, browser } = mockBrowser(createCertificatePdfFixture(['First page', 'Second page']));
  const html = '<main>Certificate without a certificate-page selector</main>';

  const image = await renderCertificatePreview(html);

  expect(page.setContent).toHaveBeenCalledWith(html, expect.any(Object));
  expect(page.pdf).toHaveBeenCalledWith({ format: 'A4', printBackground: true, pageRanges: '1' });
  expect(browser.close).toHaveBeenCalledTimes(1);
  expect(image.length).toBeLessThanOrEqual(CERTIFICATE_PREVIEW_MAX_BYTES);
  const metadata = await sharp(image).metadata();
  expect(metadata).toMatchObject({ format: 'heif', compression: 'av1', width: 640, height: 427 });
  const { data } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  // Sampling the page corner distinguishes the first red page from the second blue page.
  expect(data[0]).toBeGreaterThan(230);
  expect(data[1]).toBeLessThan(25);
  expect(data[2]).toBeLessThan(25);
});

it('rejects oversized input before launching Chromium', async () => {
  await expect(renderCertificatePreview('x'.repeat(CERTIFICATE_PREVIEW_MAX_HTML_BYTES + 1))).rejects.toThrow(
    'HTML exceeds',
  );
  expect(chromium.launch).not.toHaveBeenCalled();
});

it('rejects oversized PDFs and closes Chromium before rasterization', async () => {
  const { browser } = mockBrowser(Buffer.alloc(8 * 1024 * 1024 + 1));
  await expect(renderCertificatePreview('<main>Certificate</main>')).rejects.toThrow('PDF exceeds');
  expect(browser.close).toHaveBeenCalledTimes(1);
});

testWithPoppler('fails cleanly when the PDF cannot be rasterized', async () => {
  const { browser } = mockBrowser(Buffer.from('Invalid PDF'));
  await expect(renderCertificatePreview('<main>Certificate</main>')).rejects.toThrow();
  expect(browser.close).toHaveBeenCalledTimes(1);
});
