import sharp from 'sharp';
import { ANIMATED_GIF_FIXTURE } from '../../test/fixtures/animated-gif.fixture';
import {
  EVENT_FORM_IMAGE_FORMAT_ERROR,
  MAX_EVENT_FORM_IMAGE_FILE_SIZE_BYTES,
  convertEventFormImageToAvif,
} from './event-form-image.utils';

describe('event form image conversion', () => {
  it('rasterizes safe SVG uploads to bounded AVIF dimensions', async () => {
    const buffer = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100" fill="#1565c0"/></svg>',
    );
    const converted = await convertEventFormImageToAvif({
      buffer,
      mimetype: 'image/svg+xml',
      originalname: 'banner.svg',
      size: buffer.length,
    });

    expect(converted.originalMimeType).toBe('image/svg+xml');
    expect(converted.width).toBe(1200);
    expect(converted.height).toBe(600);
    await expect(sharp(converted.buffer).metadata()).resolves.toMatchObject({
      format: 'heif',
      width: 1200,
      height: 600,
    });
  });

  it('rejects SVG active content and external resources', async () => {
    const buffer = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><image href="https://example.com/a.png"/></svg>',
    );

    await expect(
      convertEventFormImageToAvif({
        buffer,
        mimetype: 'image/svg+xml',
        originalname: 'unsafe.svg',
        size: buffer.length,
      }),
    ).rejects.toThrow('O SVG não pode conter scripts');
  });

  it('rejects uploads above the encoded file-size limit', async () => {
    await expect(
      convertEventFormImageToAvif({
        buffer: Buffer.from('not-read'),
        mimetype: 'image/png',
        originalname: 'large.png',
        size: MAX_EVENT_FORM_IMAGE_FILE_SIZE_BYTES + 1,
      }),
    ).rejects.toThrow('A imagem deve ter no máximo 15 MB.');
  });

  it('rejects buffers whose image signature is not recognized', async () => {
    const buffer = Buffer.from('not-an-image');
    await expect(
      convertEventFormImageToAvif({ buffer, mimetype: 'image/png', originalname: 'invalid.png', size: buffer.length }),
    ).rejects.toThrow(EVENT_FORM_IMAGE_FORMAT_ERROR);
  });

  it('rejects animated images', async () => {
    const buffer = ANIMATED_GIF_FIXTURE;
    await expect(
      convertEventFormImageToAvif({ buffer, mimetype: 'image/gif', originalname: 'animated.gif', size: buffer.length }),
    ).rejects.toThrow('Imagens animadas ou com múltiplas páginas não são aceitas.');
  });

  it('rejects images above the dimension limit', async () => {
    const buffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="12001" height="1"></svg>');
    await expect(
      convertEventFormImageToAvif({ buffer, mimetype: 'image/svg+xml', originalname: 'wide.svg', size: buffer.length }),
    ).rejects.toThrow('A imagem deve ter no máximo 12000px por lado.');
  });
});
