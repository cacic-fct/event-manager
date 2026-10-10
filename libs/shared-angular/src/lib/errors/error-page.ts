import { Component, DestroyRef, ElementRef, afterNextRender, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { ErrorStateComponent } from './error-state.component';
import { RouteErrorService, RouteErrorOptions, PageErrorStatus } from './route-error.service';

@Component({
  selector: 'lib-error-page',
  imports: [ErrorStateComponent],
  host: { role: 'main' },
  template: `
    <lib-error-state [status]="status" [title]="options.title" [description]="options.description"
      [actionLabel]="options.actionLabel ?? 'Ir para a página inicial'" [actionUrl]="options.actionUrl ?? '/'"
      [actionHref]="options.actionHref"
      [technicalDetails]="options.technicalDetails" />
  `,
})
export class ErrorPage {
  private readonly route = inject(ActivatedRoute);
  private readonly errors = inject(RouteErrorService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly meta = inject(Meta);
  private readonly previousRobots = this.meta.getTag('name="robots"')?.content;
  readonly status: PageErrorStatus = this.route.snapshot.data['pageError']?.status ?? 404;
  readonly options: RouteErrorOptions = {
    ...this.route.snapshot.data['pageError'],
    ...this.errors.take(this.status),
  };

  constructor() {
    this.errors.setResponseStatus(this.status);
    inject(Title).setTitle(`Erro ${this.status} · CACiC Eventos`);
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    afterNextRender(() => {
      const heading = this.element.nativeElement.querySelector('h1');
      heading?.setAttribute('tabindex', '-1');
      heading?.focus();
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.previousRobots === undefined) this.meta.removeTag('name="robots"');
      else this.meta.updateTag({ name: 'robots', content: this.previousRobots });
    });
  }
}
