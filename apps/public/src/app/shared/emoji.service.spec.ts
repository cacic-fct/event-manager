import { EmojiService as SharedEmojiService } from '@cacic-fct/shared-angular';
import { EmojiService } from './emoji.service';

describe('public EmojiService', () => {
  it('uses the shared service for both public pages and shared components', () => {
    expect(EmojiService).toBe(SharedEmojiService);
  });

  it.each([
    ['✏', '270f'],
    ['🫩', '1fae9'],
  ])('resolves %s through the maintained asset repository', (emoji, asset) => {
    expect(new EmojiService().getTwemojiUrl(emoji)).toBe(
      `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/${asset}.svg`,
    );
  });
});
