import { EmojiService } from './emoji.service';

describe('EmojiService', () => {
  const service = new EmojiService();

  it('builds the jsDelivr Twemoji SVG URL for an emoji', () => {
    expect(service.getTwemojiUrl('🏆')).toBe('https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/1f3c6.svg');
  });

  it.each([null, undefined, '', '   ', 'plain text'])('uses the question-mark fallback for %s', (value) => {
    expect(service.getTwemojiUrl(value)).toBe('https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/2754.svg');
  });

  it('returns the first Twemoji asset when the value contains multiple emoji', () => {
    expect(service.getTwemojiUrl('⚽🏆')).toContain('/26bd.svg');
  });
});
