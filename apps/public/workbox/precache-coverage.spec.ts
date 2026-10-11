import { assertApplicationChunksPrecached } from './precache-coverage.mjs';

describe('public application precache coverage', () => {
  it('accepts eagerly cached entry, lazy startup, feature, and style chunks', () => {
    const files = ['main-ABC12345.js', 'chunk-START123.js', 'chunk-FEAT1234.js', 'styles-CSS12345.css'];
    const manifest = files.map((file) => ({ url: `/app/${file}`, revision: null }));

    expect(() => assertApplicationChunksPrecached(files, manifest)).not.toThrow();
  });

  it('rejects a missing lazy chunk even when the entry point is cached', () => {
    expect(() =>
      assertApplicationChunksPrecached(
        ['main-ABC12345.js', 'chunk-START123.js'],
        [{ url: '/app/main-ABC12345.js', revision: null }],
      ),
    ).toThrow('chunk-START123.js');
  });

  it('rejects missing styles and incorrect deployment prefixes', () => {
    expect(() =>
      assertApplicationChunksPrecached(['styles-CSS12345.css'], [{ url: '/styles-CSS12345.css', revision: null }]),
    ).toThrow('styles-CSS12345.css');
  });
});
