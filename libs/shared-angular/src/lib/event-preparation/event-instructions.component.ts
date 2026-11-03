import { Component, input } from '@angular/core';
import { MarkdownComponent } from '../markdown/markdown.component';

@Component({
  selector: 'lib-event-instructions',
  imports: [MarkdownComponent],
  host: { '[hidden]': '!content()?.trim()' },
  template: `
    @if (content()?.trim()) {
      <section>
        @if (headingLevel() === 2) {
          <h2>{{ title() }}</h2>
        } @else if (headingLevel() === 3) {
          <h3>{{ title() }}</h3>
        } @else {
          <h4>{{ title() }}</h4>
        }
        <lib-markdown [content]="content()" />
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    :host([hidden]) {
      display: none;
    }
    section {
      margin-block: 1rem;
      padding-block: 1rem;
      border-block: 1px solid var(--mat-sys-outline-variant);
    }
    h2,
    h3,
    h4 {
      margin: 0 0 0.75rem;
      font: var(--mat-sys-title-medium);
    }
  `,
})
export class EventInstructionsComponent {
  readonly title = input('Orientações da organização');
  readonly headingLevel = input<2 | 3 | 4>(2);
  readonly content = input<string | null | undefined>(null);
}
