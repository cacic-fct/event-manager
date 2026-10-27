import { Component, input, output } from '@angular/core';
import { TwemojiComponent } from '@cacic-fct/shared-angular';

/** Shared identity for public details and the participant workspace. */
@Component({
  selector: 'app-event-detail-heading',
  imports: [TwemojiComponent],
  template: `
    <header>
      @if (copyable()) {
        <button type="button" aria-label="Copiar identificador do evento" (click)="identityClicked.emit()">
          <lib-twemoji [emoji]="emoji()" aria-hidden="true" />
        </button>
      } @else {
        <lib-twemoji [emoji]="emoji()" aria-hidden="true" />
      }
      <div class="copy">
        <h1>{{ title() }}</h1>
        @if (subtitle()) {
          <p>{{ subtitle() }}</p>
        }
        <ng-content />
      </div>
    </header>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    header {
      display: flex;
      align-items: flex-start;
      gap: 16px;
    }
    lib-twemoji {
      --twemoji-size: 48px;
      flex-shrink: 0;
    }
    button {
      appearance: none;
      border: 0;
      padding: 0;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    button:focus-visible {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: 4px;
    }
    .copy {
      min-width: 0;
    }
    h1 {
      margin: 0;
      font: var(--mat-sys-headline-medium);
      overflow-wrap: anywhere;
      text-wrap: balance;
    }
    p {
      margin: 8px 0 0;
      color: var(--mat-sys-on-surface-variant);
    }
    @media (max-width: 599px) {
      header {
        flex-direction: column;
        gap: 12px;
      }
      lib-twemoji {
        --twemoji-size: 40px;
      }
      h1 {
        font: var(--mat-sys-headline-small);
      }
    }
  `,
})
export class EventDetailHeading {
  readonly title = input.required<string>();
  readonly emoji = input.required<string>();
  readonly subtitle = input<string | null | undefined>();
  readonly copyable = input(false);
  readonly identityClicked = output<void>();
}
