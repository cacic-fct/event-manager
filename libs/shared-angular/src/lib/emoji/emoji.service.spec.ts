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

  it.each([
    ['✏', '270f'],
    ['✏️', '270f'],
    ['⚙', '2699'],
    ['♟', '265f'],
    ['☑', '2611'],
    ['🖥', '1f5a5'],
    ['✏🏆', '270f'],
    ['🧑🏽‍💻', '1f9d1-1f3fd-200d-1f4bb'],
    ['👩‍⚕️', '1f469-200d-2695-fe0f'],
    ['🏳‍🌈', '1f3f3-fe0f-200d-1f308'],
    ['🏳️‍🌈', '1f3f3-fe0f-200d-1f308'],
    ['🇧🇷', '1f1e7-1f1f7'],
    ['1️⃣', '31-20e3'],
    ['🫩', '1fae9'],
  ])('resolves %s without losing emoji sequence information', (emoji, asset) => {
    expect(service.getTwemojiUrl(emoji)).toBe(
      `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/${asset}.svg`,
    );
  });
});
