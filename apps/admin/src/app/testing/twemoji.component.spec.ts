import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EmojiService, TwemojiComponent } from '@cacic-fct/shared-angular';

@Component({
  imports: [TwemojiComponent],
  template: `<lib-twemoji [emoji]="emoji()" />`,
})
class TestHostComponent {
  readonly emoji = input<string | null | undefined>('');
}

describe('TwemojiComponent', () => {
  const getTwemojiUrl = vi.fn();

  beforeEach(() => {
    getTwemojiUrl.mockReset();
    TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [{ provide: EmojiService, useValue: { getTwemojiUrl } }],
    });
  });

  it('renders the resolved emoji with its trimmed accessible label', () => {
    getTwemojiUrl.mockReturnValue('/trophy.svg');
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.componentRef.setInput('emoji', '  🏆  ');
    fixture.detectChanges();

    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    expect(getTwemojiUrl).toHaveBeenCalledWith('  🏆  ');
    expect(image.getAttribute('src')).toBe('/trophy.svg');
    expect(image.alt).toBe('🏆');
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(image.getAttribute('decoding')).toBe('async');
  });

  it('omits the image when no URL is available', () => {
    getTwemojiUrl.mockReturnValue('');
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.componentRef.setInput('emoji', '   ');
    fixture.detectChanges();

    expect(getTwemojiUrl).toHaveBeenCalledWith('   ');
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
  });

  it('updates the image and alt text when the input changes', () => {
    getTwemojiUrl.mockImplementation((emoji: string) => `/${emoji.trim()}.svg`);
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.componentRef.setInput('emoji', '⚽');
    fixture.detectChanges();
    fixture.componentRef.setInput('emoji', '🏀');
    fixture.detectChanges();

    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe('/🏀.svg');
    expect(image.alt).toBe('🏀');
  });
});
