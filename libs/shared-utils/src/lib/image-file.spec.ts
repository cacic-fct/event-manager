import { assertSafeSvg, detectImageMimeType, UnsafeSvgError } from './image-file';

describe('image file utilities', () => {
  it.each([
    [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'],
    [Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg'],
    [Buffer.from('GIF89a'), 'image/gif'],
    [Buffer.from('BM'), 'image/bmp'],
    [Buffer.from('RIFF0000WEBP'), 'image/webp'],
    [Buffer.from('0000ftypavif0000'), 'image/avif'],
    [Buffer.from('0000ftypheic0000'), 'image/heic'],
    [Buffer.from('0000ftypmif10000'), 'image/heif'],
    [Buffer.from('\uFEFF <?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml'],
  ])('detects image content rather than relying on a declared MIME type', (buffer, expected) => {
    expect(detectImageMimeType(buffer)).toBe(expected);
  });

  it('finds a compatible ISO BMFF brand after the primary brand', () => {
    expect(detectImageMimeType(Buffer.from('0000ftypmif10000avif'))).toBe('image/avif');
  });

  it('returns undefined for unknown content', () => {
    expect(detectImageMimeType(Buffer.from('not an image'))).toBeUndefined();
  });

  it.each([
    '<svg><script>alert(1)</script></svg>',
    '<svg><foreignObject><p>HTML</p></foreignObject></svg>',
    '<svg><rect onclick="alert(1)"/></svg>',
    '<svg><image href="https://example.com/image.png"/></svg>',
    '<svg><image href="file:///etc/passwd"/></svg>',
    '<svg><style>rect { fill: url(https://example.com/paint.svg) }</style></svg>',
    '<svg><style>@import "https://example.com/style.css";</style></svg>',
    '<svg><use xlink:href="data:image/svg+xml;base64,PHN2Zy8+"/></svg>',
    '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg>&xxe;</svg>',
  ])('rejects active, external, or entity-based SVG content', (source) => {
    expect(() => assertSafeSvg(Buffer.from(source))).toThrow(UnsafeSvgError);
  });

  it('accepts self-contained SVG markup', () => {
    expect(() =>
      assertSafeSvg(
        Buffer.from(
          '<svg><defs><linearGradient id="paint"/></defs><rect fill="url(#paint)"/><use href="#paint"/></svg>',
        ),
      ),
    ).not.toThrow();
  });
});
