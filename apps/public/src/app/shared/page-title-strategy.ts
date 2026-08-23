import { Service, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

export const PAGE_TITLE_SUFFIX = 'CACiC Eventos';

@Service()
export class PageTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const title = this.buildTitle(snapshot);
    if (!title) {
      return;
    }

    this.title.setTitle(`${title} - ${PAGE_TITLE_SUFFIX}`);
  }
}
