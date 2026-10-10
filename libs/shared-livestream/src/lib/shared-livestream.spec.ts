import { livestreamExternalUrl, normalizeLivestreamValue, normalizeTwitchChannel, normalizeYoutubeCode } from './shared-livestream';

describe('livestream identifiers', () => {
  it.each([
    ' dQw4w9WgXcQ ',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=tracking',
    'https://youtu.be/dQw4w9WgXcQ?si=tracking',
    'youtube.com/live/dQw4w9WgXcQ',
    'https://m.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  ])('extracts YouTube codes from %s', (value) => {
    expect(normalizeYoutubeCode(value)).toBe('dQw4w9WgXcQ');
  });

  it.each([
    ' CACiC ', 'https://www.twitch.tv/CACiC?referrer=tracking',
    'twitch.tv/CACiC', 'https://twitch.tv/cacic/about',
    'https://player.twitch.tv/?channel=CACiC&parent=example.com',
  ])('extracts Twitch channels from %s', (value) => {
    expect(normalizeTwitchChannel(value)).toBe('cacic');
  });

  it.each([
    'https://youtube.com.evil.example/watch?v=abc',
    'https://evil.example/abc', 'javascript:alert(1)',
    'https://youtube.com/watch?v=abc%2Fdef', 'https://youtube.com/playlist?list=abc',
    'https://user:password@youtube.com/watch?v=abc',
  ])('rejects unsafe or unsupported YouTube input %s', (value) => {
    expect(normalizeYoutubeCode(value)).toBeNull();
  });

  it.each([
    'https://twitch.tv.evil.example/cacic', 'https://clips.twitch.tv/SomeClip',
    'https://twitch.tv/videos/123', 'https://twitch.tv/directory',
    'https://twitch.tv/cacic/clip/SomeClip', 'https://evil.example/cacic',
    'https://twitch.tv/abc%2Fdef', 'a'.repeat(26),
  ])('rejects unsupported Twitch input %s', (value) => {
    expect(normalizeTwitchChannel(value)).toBeNull();
  });

  it('handles clears without creating invalid identifiers', () => {
    for (const value of [null, undefined, '', '  ']) {
      expect(normalizeYoutubeCode(value)).toBeNull();
      expect(normalizeTwitchChannel(value)).toBeNull();
    }
  });

  it('preserves general HTTPS URLs and rejects unsafe links', () => {
    expect(normalizeLivestreamValue('GENERAL', ' https://example.com/live?a=b ')).toBe('https://example.com/live?a=b');
    expect(normalizeLivestreamValue('GENERAL', 'http://example.com/live')).toBeNull();
    expect(livestreamExternalUrl('GENERAL', 'javascript:alert(1)')).toBeNull();
  });

  it('builds canonical provider links from identifiers and legacy URLs', () => {
    expect(livestreamExternalUrl('YOUTUBE', 'video-1')).toBe('https://www.youtube.com/watch?v=video-1');
    expect(livestreamExternalUrl('TWITCH', 'https://twitch.tv/CACiC')).toBe('https://www.twitch.tv/cacic');
  });
});
