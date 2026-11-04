import { Component, computed, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink } from '@angular/router';
import { PageProgress } from './page-progress';

@Component({
  selector: 'app-event-information-nav',
  imports: [MatButtonModule, MatIconModule, MatToolbarModule, RouterLink, PageProgress],
  template: `
    <mat-toolbar role="navigation" aria-label="Navegação do evento">
      <a matIconButton [routerLink]="backUrl()" [attr.aria-label]="backLabel()">
        <mat-icon aria-hidden="true">arrow_back</mat-icon>
      </a>
      <span>{{ title() }}</span>
    </mat-toolbar>
    <app-page-progress [loading]="loading()" />
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class EventInformationNav {
  readonly title = input.required<string>();
  readonly backUrl = input.required<string>();
  readonly loading = input.required<boolean>();

  protected readonly backLabel = computed(() => {
    const path = this.backUrl().split(/[?#]/, 1)[0];
    if (path === '/profile/attendances') return 'Voltar para minhas participações';
    if (path === '/major-event') return 'Voltar aos grandes eventos';
    if (path === '/calendar') return 'Voltar ao calendário';
    if (path.startsWith('/event/')) return 'Voltar ao evento';
    return 'Voltar';
  });
}
