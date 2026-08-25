import sharp from 'sharp';
import { convertEventFormImageToAvif } from './event-form-image.utils';

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
    await expect(sharp(converted.buffer).metadata()).resolves.toMatchObject({ format: 'heif', width: 1200, height: 600 });
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
});
