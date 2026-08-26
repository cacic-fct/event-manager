import { Component, input, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { PrizeDrawConfettiComponent } from './prize-draw-confetti.component';

@Component({
  selector: 'app-prize-draw-confetti-story-harness',
  imports: [MatButtonModule, PrizeDrawConfettiComponent],
  template: `
    <main class="confetti-stage">
      <app-prize-draw-confetti
        [particleCount]="particleCount()"
        [durationMs]="durationMs()"
        [reducedMotion]="reducedMotion()" />
      <div class="confetti-copy">
        <h1>Confete da revelação</h1>
        <p>Explosão breve, restrita ao resultado em tela cheia.</p>
        <button mat-stroked-button type="button" (click)="restart()">
          {{ reducedMotion() ? 'Recriar padrão de confete' : 'Repetir confete' }}
        </button>
      </div>
    </main>
  `,
  styles: `
    .confetti-stage { position: relative; display: grid; min-height: 100vh; place-content: center; overflow: hidden; background: var(--mat-sys-surface); }
    .confetti-copy { position: relative; z-index: 1; display: grid; justify-items: center; gap: .65rem; padding: 2rem; text-align: center; }
    h1, p { margin: 0; }
    p { color: var(--mat-sys-on-surface-variant); }
  `,
})
export class PrizeDrawConfettiStoryHarness {
  readonly particleCount = input(110);
  readonly durationMs = input(2400);
  readonly reducedMotion = input(false);
  private readonly confetti = viewChild(PrizeDrawConfettiComponent);

  restart(): void {
    this.confetti()?.restart();
  }
}
