import { Component, input } from '@angular/core';

@Component({
  selector: 'app-sticky-date-header',
  template: `{{ label() }}`,
  host: {
    '[attr.role]': 'headingLevel() ? "heading" : null',
    '[attr.aria-level]': 'headingLevel()',
    '[style.top.px]': 'topOffset()',
  },
  styles: `
    :host {
      display: block;
      background: var(--mat-sys-surface-container-high);
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      border-top: 1px solid var(--mat-sys-outline-variant);
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-large);
      padding: 8px 16px;
      position: sticky;
      top: var(--calendar-toolbar-height, 64px);
      z-index: 1;
    }

    :host::first-letter {
      text-transform: uppercase;
    }
  `,
})
export class StickyDateHeader {
  readonly label = input.required<string>();
  readonly headingLevel = input<2 | 3 | 4 | null>(null);
  readonly topOffset = input<number | null>(null);
}
