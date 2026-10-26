import { Service } from '@angular/core';
import { parse } from '@twemoji/parser';

@Service()
export class EmojiService {
  getTwemojiUrl(emoji: string | null | undefined): string {
    const parsedEmoji = this.parseEmoji(emoji);

    return parsedEmoji[0]?.url ?? this.parseEmoji('❔')[0]?.url ?? '';
  }

  private parseEmoji(emoji: string | null | undefined) {
    // Saved symbols may omit VS16 (for example, ✏ or ⚙). The parser requires
    // emoji presentation for these symbols; preserve existing selectors and modifiers.
    const value = (emoji?.trim() || '❔').replace(
      /(\p{Extended_Pictographic})(?![\uFE0E\uFE0F]|\p{Emoji_Modifier})/gu,
      (symbol) => (/\p{Emoji_Presentation}/u.test(symbol) ? symbol : `${symbol}\uFE0F`),
    );

    return parse(value, {
      buildUrl: (codepoints, assetType) =>
        `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/${codepoints}.${assetType}`,
    });
  }
}
