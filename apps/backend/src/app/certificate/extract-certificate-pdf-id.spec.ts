import { spawnSync } from 'node:child_process';
import { createCertificatePdfFixture } from './certificate-pdf.fixtures';
import { extractCertificatePdfId, findCertificatePdfId } from './extract-certificate-pdf-id';

const popplerMissing = spawnSync('pdftotext', ['-v']).error?.code === 'ENOENT';
const testWithPoppler = popplerMissing && !process.env.CI ? it.skip : it;

describe('findCertificatePdfId', () => {
  const host = 'eventos.cacic.com.br';
  const id = '019cb4fe-76e3-7000-8000-8a75e6b8f1cb';
  const otherId = '019cb4fe-76e3-7000-8000-8a75e6b8f1cc';

  testWithPoppler('extracts a printed verification link with the real Poppler parser', async () => {
    const pdf = createCertificatePdfFixture([`https://${host}/validar/${id}`]);
    await expect(extractCertificatePdfId(pdf)).resolves.toBe(id);
  });

  testWithPoppler('rejects different certificate links across PDF pages', async () => {
    const pdf = createCertificatePdfFixture([`${host}/validar/${id}`, `${host}/validar/${otherId}`]);
    await expect(extractCertificatePdfId(pdf)).resolves.toBeNull();
  });

  it('recovers the wrapped code from the printed link and deduplicates repeated links', () => {
    const text = `${host}/validar/019cb4fe-76e3-\n7000-8000-8a75e6b8f1cb\fhttps://${host}/validar/${id}`;
    expect(findCertificatePdfId(text)).toBe(id);
  });

  it('supports the verification origin configured for a deployment', () => {
    expect(findCertificatePdfId(`example.test:4200/validar/${id}`, 'http://example.test:4200')).toBe(id);
  });

  it.each([
    id,
    `https://other.example/validar/${id}`,
    `https://other.${host}/validar/${id}`,
    `${host}/validar/${id}-extra`,
    `${host}/validar/019cb4fe-76e3-\f7000-8000-8a75e6b8f1cb`,
    `${host}/validar/${id}\f${host}/validar/${otherId}`,
  ])('rejects text without a unique certificate verification link (%s)', (text) => {
    expect(findCertificatePdfId(text)).toBeNull();
  });
});
