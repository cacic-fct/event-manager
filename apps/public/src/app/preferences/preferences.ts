import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AuthService, ServiceWorkerService } from '@cacic-fct/shared-angular';

@Component({
  selector: 'app-preferences',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatListModule, MatToolbarModule],
  template: `
    <mat-toolbar>
      <a matIconButton routerLink="/menu" aria-label="Voltar para o menu">
        <mat-icon>arrow_back</mat-icon>
      </a>
      <span>Preferências</span>
    </mat-toolbar>

    <main class="global-container">
      <mat-nav-list>
        <h3 matSubheader>Aplicativo</h3>

        <a mat-list-item routerLink="/preferences/calendar">
          <mat-icon matListItemIcon>calendar_month</mat-icon>
          <span matListItemTitle>Calendário</span>
        </a>

        <a mat-list-item routerLink="/preferences/service-worker">
          <mat-icon matListItemIcon>handyman</mat-icon>
          <span matListItemTitle>Service Worker</span>
          <div matListItemLine>{{ serviceWorkerService.hasServiceWorker() ? 'Operacional' : 'Indisponível' }}</div>
        </a>

        @if (authService.isAuthenticated()) {
          <h3 matSubheader>Conta</h3>

          <a mat-list-item href="https://account.cacic.dev.br/app/">
            <mat-icon matListItemIcon>person_edit</mat-icon>
            <span matListItemTitle>Editar informações da conta</span>
          </a>

          <a
            mat-list-item
            role="button"
            tabindex="0"
            (click)="authService.logout()"
            (keydown.enter)="authService.logout()"
            (keydown.space)="authService.logout()">
            <mat-icon matListItemIcon>logout</mat-icon>
            <span matListItemTitle>Sair da conta</span>
          </a>
        }
      </mat-nav-list>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Preferences {
  readonly authService = inject(AuthService);
  readonly serviceWorkerService = inject(ServiceWorkerService);
}
