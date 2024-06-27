import { EmojiService } from 'src/app/shared/services/emoji.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

describe('EmojiService', () => {
  let service: EmojiService;
  let sanitizer: DomSanitizer;

  beforeEach(() => {
    sanitizer = jasmine.createSpyObj('DomSanitizer', ['bypassSecurityTrustResourceUrl']);
    service = new EmojiService(sanitizer);
  });

  it('#getEmoji should return a safe resource URL for a valid emoji', () => {
    const emoji = '😀';
    const expectedUrl = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/1f600.svg';
    const safeUrl: SafeResourceUrl = 'safe-url';

    (sanitizer.bypassSecurityTrustResourceUrl as jasmine.Spy).and.returnValue(safeUrl);

    const result = service.getEmoji(emoji);

    expect(sanitizer.bypassSecurityTrustResourceUrl).toHaveBeenCalledWith(expectedUrl);
    expect(result).toBe(safeUrl);
  });

  it(`#getEmoji should return a safe resource URL pointing to '❔' for an invalid emoji`, () => {
    const emoji = 'invalid-emoji';
    const expectedUrl = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/2754.svg';
    const safeUrl: SafeResourceUrl = 'safe-url';

    (sanitizer.bypassSecurityTrustResourceUrl as jasmine.Spy).and.returnValue(safeUrl);

    const result = service.getEmoji(emoji);

    expect(sanitizer.bypassSecurityTrustResourceUrl).toHaveBeenCalledWith(expectedUrl);
    expect(result).toBe(safeUrl);
  });
});
