import { Injectable } from '@angular/core';

import { parse } from 'twemoji-parser';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Injectable({
  providedIn: 'root',
})
export class EmojiService {
  constructor(private sanitizer: DomSanitizer) {}

  /**
   * Receives an emoji and returns a safe url to be used in the src attribute of an img tag
   *
   * If the emoji is invalid, returns a question mark emoji '❔'
   * @param emoji - The emoji to be parsed
   * @returns SafeResourceUrl
   *
   */
  getEmoji(emoji: string): SafeResourceUrl {
    if (emoji === undefined || !/^\p{Emoji}|\p{Emoji_Modifier}$/u.test(emoji)) {
      // TODO: validar apenas 1 emoji
      return this.sanitizer.bypassSecurityTrustResourceUrl(parse('❔')[0].url);
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(parse(emoji)[0].url);
  }
}
