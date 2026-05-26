import { EmojiService } from './emoji.service';

describe('EmojiService', () => {
  const service = new EmojiService();

  it('builds twemoji URLs for provided emoji', () => {
    expect(service.getTwemojiUrl('🎉')).toBe(
      'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/1f389.svg',
    );
  });

  it('falls back to the question emoji for blank values', () => {
    expect(service.getTwemojiUrl('   ')).toBe(
      'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/2754.svg',
    );
    expect(service.getTwemojiUrl(null)).toBe('https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/2754.svg');
  });
});
