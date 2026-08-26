import { Component, computed, effect, input, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { PrizeDrawSpeed } from '@cacic-fct/event-manager-admin-contracts';
import { createPrizeDrawSpinResultStory, prizeDrawStoryFullNames } from '../prize-draw-story.fixtures';
import { PrizeDrawReelComponent } from './prize-draw-reel.component';

@Component({
  selector: 'app-prize-draw-reel-story-harness',
  imports: [MatButtonModule, PrizeDrawReelComponent],
  template: `
    <main class="story-stage">
      <section class="story-context" aria-label="Configuração desta demonstração">
        <strong>Lista simulada com {{ rosterSize() }} nomes</strong>
      </section>
      <app-prize-draw-reel [names]="rosterNames()" />
      <div class="story-actions">
        <button mat-flat-button type="button" [disabled]="rosterSize() < 1" (click)="play()">Sortear agora</button>
        <button mat-stroked-button type="button" (click)="reset()">Reiniciar</button>
      </div>
    </main>
  `,
  styles: `
    .story-stage {
      display: grid;
      gap: 1.5rem;
      min-height: 38rem;
      place-content: center;
      padding: 2rem;
      background: var(--mat-sys-surface-container-low);
    }
    .story-context {
      display: flex;
      justify-content: center;
      color: var(--mat-sys-on-surface-variant);
    }
    .story-context strong {
      color: var(--mat-sys-on-surface);
    }
    .story-actions {
      display: flex;
      justify-content: center;
      gap: 0.75rem;
    }
  `,
})
export class PrizeDrawReelStoryHarness {
  readonly speed = input<PrizeDrawSpeed>('QUICK');
  readonly reducedMotion = input(false);
  readonly rosterSize = input(18);
  readonly winnerName = input(prizeDrawStoryFullNames[2]);
  readonly countdownSeconds = input<3 | 5>(3);
  readonly durationScale = input(1);
  readonly demo = input(false);
  private readonly reel = viewChild(PrizeDrawReelComponent);
  private readonly result = computed(() =>
    createPrizeDrawSpinResultStory({
      speed: this.speed(),
      rosterSize: Math.max(1, this.rosterSize()),
      winnerFullName: this.winnerName(),
      countdownSeconds: this.countdownSeconds(),
      durationScale: this.durationScale(),
      demo: this.demo(),
    }),
  );
  readonly rosterNames = computed(() => (this.rosterSize() < 1 ? [] : this.result().reelNames));

  constructor() {
    effect(() => {
      const reel = this.reel();
      if (reel) reel.reset(this.rosterNames());
    });
  }

  play(): void {
    if (this.rosterSize() < 1) return;
    void this.reel()?.play(this.result(), this.reducedMotion());
  }

  reset(): void {
    this.reel()?.reset(this.rosterNames());
  }
}
