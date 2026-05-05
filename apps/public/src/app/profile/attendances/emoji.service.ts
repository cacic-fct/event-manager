import { Injectable } from '@angular/core';
import { parse } from '@twemoji/parser';

@Injectable({ providedIn: 'root' })
export class EmojiService {
  getTwemojiUrl(emoji: string | null | undefined): string {
    const parsedEmoji = this.parseEmoji(emoji);
    const fallbackUrl = this.parseEmoji('❔')[0]?.url;
    return parsedEmoji[0]?.url ?? fallbackUrl ?? '';
  }

  private parseEmoji(emoji: string | null | undefined) {
    const value = emoji?.trim() || '❔';

    return parse(value, {
      buildUrl: (codepoints, assetType) =>
        `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/${codepoints}.${assetType}`,
    });
  }
}
