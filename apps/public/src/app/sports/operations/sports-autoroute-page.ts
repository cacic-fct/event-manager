import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { SportsOperationsApiService } from './sports-operations-api.service';

@Component({
  selector: 'app-sports-autoroute-page',
  imports: [MatButtonModule, MatIconModule, RouterLink],
  template: `
    <main class="route-state">
      @if (loading()) {
        <mat-icon aria-hidden="true">sports_score</mat-icon>
        <h1>Encontrando sua próxima partida</h1>
      } @else {
        <mat-icon aria-hidden="true">sports</mat-icon>
        <h1>{{ error() ? 'Não foi possível abrir a partida' : 'Nenhuma partida para operar agora' }}</h1>
        <p>{{ error() || 'Quando uma partida estiver próxima, ela aparecerá aqui automaticamente.' }}</p>
        <button mat-flat-button type="button" (click)="load()">Tentar novamente</button>
        <a mat-button routerLink="/calendar">Ver calendário</a>
      }
    </main>
  `,
  styles: `
    :host {
      display: block;
      min-height: 70dvh;
    }
    .route-state {
      min-height: 70dvh;
      padding: 2rem 1.25rem;
      display: grid;
      place-content: center;
      justify-items: center;
      gap: 0.75rem;
      text-align: center;
    }
    h1 {
      margin: 0.5rem 0 0;
      font-size: clamp(1.5rem, 5vw, 2.25rem);
      letter-spacing: -0.025em;
    }
    p {
      max-width: 56ch;
      margin: 0 0 0.5rem;
      color: var(--mat-sys-on-surface-variant);
    }
    mat-icon {
      width: 3rem;
      height: 3rem;
      font-size: 3rem;
      color: var(--mat-sys-primary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SportsAutoroutePage implements OnInit {
  private readonly api = inject(SportsOperationsApiService);
  private readonly router = inject(Router);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  private requestId = 0;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const requestId = ++this.requestId;
    this.loading.set(true);
    this.error.set(null);
    this.api.autoroute().subscribe({
      next: (route) => {
        if (requestId !== this.requestId) {
          return;
        }
        this.loading.set(false);
        if (!route) {
          return;
        }
        if (route.mode === 'WALLET') {
          void this.router.navigate(['/profile/wallet'], {
            queryParams: { sportsMatchId: route.matchId },
          });
          return;
        }
        if (route.mode === 'TEAM' && route.teamId) {
          void this.router.navigate(['/sports/team', route.teamId]);
          return;
        }
        if (!route.matchId) {
          this.error.set('O atalho da partida está incompleto. Tente novamente.');
          return;
        }
        const destination =
          route.mode === 'MATCH_DETAIL' ? ['/sports/match', route.matchId] : ['/sports/operate', route.matchId];
        void this.router.navigate(destination, { queryParams: { mode: route.mode } });
      },
      error: (error: unknown) => {
        if (requestId !== this.requestId) {
          return;
        }
        this.loading.set(false);
        this.error.set(error instanceof Error ? error.message : 'Tente novamente em instantes.');
      },
    });
  }
}
