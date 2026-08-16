import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MarkdownService } from './markdown.service';

@Component({
  selector: 'lib-markdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="markdown-body" [innerHTML]="renderedHtml()"></div>`,
  styles: `
    :host {
      display: block;
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .markdown-body {
      box-sizing: border-box;
      color: inherit;
      background-color: inherit;
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
      max-width: none;
    }
  `,
})
export class MarkdownComponent {
  private readonly markdown = inject(MarkdownService);

  readonly content = input<string | null | undefined>('');
  protected readonly renderedHtml = computed(() => this.markdown.render(this.content()));
}
