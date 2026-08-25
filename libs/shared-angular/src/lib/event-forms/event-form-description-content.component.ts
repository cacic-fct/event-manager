import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormImage } from '@cacic-fct/form-contracts';

@Component({
  selector: 'lib-event-form-description-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgOptimizedImage],
  template: `
    @if (text(); as descriptionText) {
      <p class="description-text">{{ descriptionText }}</p>
    }
    @for (image of images(); track $index) {
      <figure>
        <img
          [ngSrc]="image.url"
          [width]="image.width"
          [height]="image.height"
          [alt]="image.altText || ''" />
        @if (image.caption) {
          <figcaption>{{ image.caption }}</figcaption>
        }
      </figure>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 12px;
      min-width: 0;
    }

    .description-text {
      margin: 0;
      overflow-wrap: anywhere;
      text-wrap: pretty;
      white-space: pre-line;
    }

    figure {
      display: grid;
      gap: 6px;
      margin: 0;
      min-width: 0;
    }

    img {
      background: var(--mat-sys-surface-container-highest);
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
      display: block;
      height: auto;
      max-height: min(72vh, 900px);
      object-fit: contain;
      width: 100%;
    }

    figcaption {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
      overflow-wrap: anywhere;
    }
  `,
})
export class EventFormDescriptionContentComponent {
  readonly text = input<string | undefined>();
  readonly images = input<readonly FormImage[]>([]);
}
