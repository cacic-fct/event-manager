import { isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, PLATFORM_ID, inject, input, signal, viewChild } from '@angular/core';
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
        [reducedMotion]="prefersReducedMotion()" />
      <div class="confetti-copy">
        <h1>Confete da revelação</h1>
        <p>Explosão breve, restrita ao resultado em tela cheia.</p>
        <button mat-stroked-button type="button" (click)="restart()">
          {{ prefersReducedMotion() ? 'Recriar padrão de confete' : 'Repetir confete' }}
        </button>
      </div>
    </main>
  `,
  styles: `
    .confetti-stage {
      position: relative;
      display: grid;
      min-height: 100vh;
      place-content: center;
      overflow: hidden;
      background: var(--mat-sys-surface);
    }
    .confetti-copy {
      position: relative;
      z-index: 1;
      display: grid;
      justify-items: center;
      gap: 0.65rem;
      padding: 2rem;
      text-align: center;
    }
    h1,
    p {
      margin: 0;
    }
    p {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class PrizeDrawConfettiStoryHarness {
  readonly particleCount = input(110);
  readonly durationMs = input(2400);
  readonly prefersReducedMotion = signal(false);
  private readonly confetti = viewChild(PrizeDrawConfettiComponent);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => this.prefersReducedMotion.set(motionPreference.matches);
    updatePreference();
    motionPreference.addEventListener('change', updatePreference);
    this.destroyRef.onDestroy(() => motionPreference.removeEventListener('change', updatePreference));
  }

  restart(): void {
    this.confetti()?.restart();
  }
}
