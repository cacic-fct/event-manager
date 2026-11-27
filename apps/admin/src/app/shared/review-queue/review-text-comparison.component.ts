import { Component, input } from '@angular/core';

@Component({
  selector: 'app-review-text-comparison',
  template: `
    <dl>
      <div>
        <dt>{{ beforeLabel() }}</dt>
        <dd>{{ before() ?? emptyLabel() }}</dd>
      </div>
      <div>
        <dt>{{ afterLabel() }}</dt>
        <dd>{{ after() ?? emptyLabel() }}</dd>
      </div>
    </dl>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    dl {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem;
      margin: 0;
    }
    dl > div {
      padding: 0.75rem;
      border-radius: 0.5rem;
      background: var(--mat-sys-surface-container-low);
    }
    dt {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    dd {
      margin: 0.25rem 0 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    @media (max-width: 640px) {
      dl {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class ReviewTextComparisonComponent {
  readonly before = input<string | null>(null);
  readonly after = input<string | null>(null);
  readonly beforeLabel = input('Antes');
  readonly afterLabel = input('Proposto');
  readonly emptyLabel = input('Sem valor');
}
