import { describe, expect, it } from 'vitest';
import { MAX_EVENT_MATERIAL_URL_LENGTH, parseEventMaterials } from './shared-event-preparation';

describe('event material links', () => {
  it('checks the canonical URL length and accepts normalized links on subsequent reads', () => {
    const prefix = 'https://example.org/';
    const oversized = `${prefix}${'é'.repeat(400)}`;
    expect(oversized.length).toBeLessThan(MAX_EVENT_MATERIAL_URL_LENGTH);
    expect(() => parseEventMaterials([{ title: 'Material', url: oversized }])).toThrow('2.048');
    const url = `${prefix}${'é'.repeat(300)}`;
    const normalized = parseEventMaterials([{ title: 'Material', url }]);
    expect(parseEventMaterials(normalized)).toEqual(normalized);
    const boundary = `${prefix}${'x'.repeat(MAX_EVENT_MATERIAL_URL_LENGTH - prefix.length)}`;
    expect(parseEventMaterials([{ title: 'Material', url: boundary }])[0].url).toHaveLength(
      MAX_EVENT_MATERIAL_URL_LENGTH,
    );
    expect(() => parseEventMaterials([{ title: 'Material', url: `${boundary}x` }])).toThrow('2.048');
  });
  it('normalizes names and HTTPS URLs without mutating the caller', () => {
    const links = [{ title: ' Slides ', url: 'https://EXAMPLE.org' }];
    expect(parseEventMaterials(links)).toEqual([{ title: 'Slides', url: 'https://example.org/' }]);
    expect(links[0].title).toBe(' Slides ');
    expect(parseEventMaterials([])).toEqual([]);
  });
  it('accepts only the optional event-end release flag and preserves it for persistence', () => {
    const link = { title: 'Respostas', url: 'https://example.org/respostas', releaseAfterEvent: true };
    expect(parseEventMaterials([link])).toEqual([link]);
    expect(parseEventMaterials([{ ...link, releaseAfterEvent: false }])).toEqual([
      { title: link.title, url: link.url },
    ]);
    expect(() => parseEventMaterials([{ ...link, releaseAfterEvent: 'tomorrow' }])).toThrow();
  });
  it.each([
    'javascript:alert(1)',
    'data:text/html,example',
    'http://example.org',
    '//example.org',
    'https://user:password@example.org',
  ])('rejects %s', (url) => {
    expect(() => parseEventMaterials([{ title: 'Material', url }])).toThrow();
  });
  it('rejects duplicate canonical links, missing titles, unexpected shapes, and oversized lists', () => {
    expect(() =>
      parseEventMaterials([
        { title: 'A', url: 'https://example.org' },
        { title: 'B', url: 'https://example.org/' },
      ]),
    ).toThrow('uma vez');
    expect(() => parseEventMaterials([{ title: ' ', url: 'https://example.org' }])).toThrow();
    expect(() => parseEventMaterials([{ title: 'x'.repeat(201), url: 'https://example.org' }])).toThrow();
    expect(() => parseEventMaterials([null])).toThrow();
    expect(() => parseEventMaterials({})).toThrow();
    expect(() => parseEventMaterials(Array.from({ length: 21 }, () => ({})))).toThrow('20');
  });
});
