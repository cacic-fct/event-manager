import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  computed,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { Router } from '@angular/router';
import { AuthService, CacicLogoComponent } from '@cacic-eventos/shared-angular';

@Component({
  selector: 'app-login-page',
  imports: [MatButtonModule, MatCardModule, CacicLogoComponent],
  template: `
    <main class="login-page">
      <mat-card>
        <lib-cacic-logo [fillColor]="fillColor()"></lib-cacic-logo>
        <h1>Event Manager</h1>
        <p>Painel interno de controle de eventos.</p>
        <p>É necessário permissão de acesso para utilizar esta aplicação.</p>
        <button mat-flat-button (click)="onLoginClick()">Entrar</button>
      </mat-card>
    </main>
  `,
  styles: [
    `
      .login-page {
        display: grid;
        place-items: center;
        padding: 1rem;
      }

      mat-card {
        max-width: 32rem;
        width: min(100%, 32rem);
        // display: grid;
        // gap: 1rem;
        padding: 2rem;
      }
    `,
  ],
})
export class LoginPageComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  private platformId = inject(PLATFORM_ID);
  private isDarkSignal = signal(false);
  fillColor = computed(() => (this.isDarkSignal() ? '#fff' : '#000'));
  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      const media = window.matchMedia('(prefers-color-scheme: dark)');

      this.isDarkSignal.set(media.matches);

      media.addEventListener('change', (e) => {
        this.isDarkSignal.set(e.matches);
        console.log('Dark mode changed:', e.matches);
      });
    }
  }

  async onLoginClick(): Promise<void> {
    if (this.authService.isAuthenticated()) {
      await this.router.navigateByUrl('/');
      return;
    }
    await this.authService.login();
  }
}
