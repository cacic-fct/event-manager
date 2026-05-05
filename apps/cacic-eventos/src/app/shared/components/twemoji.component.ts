import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { EmojiService } from '../services/emoji.service';

@Component({
  selector: 'app-twemoji',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (emojiUrl()) {
      <img
        class="twemoji"
        [src]="emojiUrl()"
        [alt]="emojiAlt()"
        width="24"
        height="24"
        loading="lazy"
        decoding="async"
      />
    }
  `,
  styles: [
    `
      :host {
        display: inline-grid;
        width: var(--twemoji-size, 1.35rem);
        height: var(--twemoji-size, 1.35rem);
        flex: 0 0 auto;
        place-items: center;
        vertical-align: -0.18em;
      }

      .twemoji {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
    `,
  ],
})
export class TwemojiComponent {
  readonly emoji = input<string | null | undefined>('');

  private readonly emojiService = inject(EmojiService);

  protected readonly emojiUrl = computed(() =>
    this.emojiService.getTwemojiUrl(this.emoji()),
  );

  protected readonly emojiAlt = computed(() => this.emoji()?.trim() || 'emoji');
}
