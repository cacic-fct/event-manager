import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, PLATFORM_ID, computed, inject, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PrizeDrawReelComponent, type PrizeDrawReelResult } from '@cacic-fct/shared-angular';
import { playShowcaseSequence } from './showcase-animation';

const PARTICIPANTS = [
  'Ana Oliveira',
  'Camila Nunes',
  'Gustavo Lima',
  'Rafael Costa',
  'Júlia Carvalho',
  'Lucas Rocha',
  'Beatriz Lima',
  'Daniel Alves',
  'Marina Prado',
] as const;

@Component({
  selector: 'app-landing-prize-draw-demo',
  imports: [MatButtonModule, MatIconModule, PrizeDrawReelComponent],
  templateUrl: './prize-draw-demo.html',
  styleUrl: './prize-draw-demo.scss',
})
export class PrizeDrawDemoComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly document = inject(DOCUMENT);
  private readonly reel = viewChild(PrizeDrawReelComponent);
  private automaticDraw = false;
  private drawGeneration = 0;
  private motionQuery: MediaQueryList | undefined;
  private motionChangeListener: ((event: MediaQueryListEvent) => void) | undefined;

  readonly participants = [...PARTICIPANTS];
  readonly eligibleCount = PARTICIPANTS.length;
  readonly winnerName = 'Beatriz Lima';
  readonly prizeName = 'Kit criatividade';
  readonly spinResult: PrizeDrawReelResult = {
    winnerReelName: 'Beatriz Lima',
    winnerReelIndex: PARTICIPANTS.indexOf('Beatriz Lima'),
    reelNames: [...PARTICIPANTS],
    speed: 'QUICK',
    countdownMs: 0,
    reelDurationMs: 3000,
    preRevealPauseMs: 0,
  };
  readonly drawState = signal<'ready' | 'spinning' | 'winner'>('ready');
  readonly statusMessage = signal('');
  readonly soundMuted = signal(false);
  readonly isSpinning = computed(() => this.drawState() === 'spinning');
  readonly hasWinner = computed(() => this.drawState() === 'winner');
  private readonly prefersReducedMotion = signal(false);
  private readonly userInitiatedDraw = signal(false);

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.drawGeneration += 1;
      this.reel()?.reset([...PARTICIPANTS]);
      this.automaticDraw = false;

      if (this.motionQuery && this.motionChangeListener) {
        this.motionQuery.removeEventListener('change', this.motionChangeListener);
      }
    });

    if (this.isBrowser && typeof window.matchMedia === 'function') {
      this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.prefersReducedMotion.set(this.motionQuery.matches || this.storybookPrefersReducedMotion());
      this.motionChangeListener = (event) => {
        this.prefersReducedMotion.set(event.matches || this.storybookPrefersReducedMotion());

        if (this.reducedMotionRequested() && this.isSpinning()) {
          this.reel()?.requestReducedMotion();
        }
      };
      this.motionQuery.addEventListener('change', this.motionChangeListener);
    } else {
      this.prefersReducedMotion.set(this.storybookPrefersReducedMotion());
    }

    playShowcaseSequence((schedule) => {
      let automaticDrawStarted = false;
      schedule(() => {
        if (this.userInitiatedDraw()) {
          return;
        }

        automaticDrawStarted = this.startDraw(true);
      }, 350);

      return () => {
        if (automaticDrawStarted) {
          this.cancelAutomaticDraw();
        }
      };
    }, () => !this.userInitiatedDraw() && !this.reducedMotionRequested());
  }

  requestDraw(): void {
    if (this.isSpinning()) {
      return;
    }

    this.userInitiatedDraw.set(true);
    this.startDraw(false);
  }

  toggleSound(): void {
    this.soundMuted.update((muted) => !muted);
  }

  private startDraw(automatic: boolean): boolean {
    if (this.isSpinning()) {
      return false;
    }

    const reel = this.reel();
    if (!reel) {
      return false;
    }

    const wasReady = this.drawState() === 'ready';
    const reducedMotion = this.reducedMotionRequested();
    const generation = ++this.drawGeneration;
    this.automaticDraw = automatic;
    this.drawState.set('spinning');
    this.statusMessage.set('Sorteio em andamento.');

    if (wasReady) {
      reel.reset([...PARTICIPANTS]);
    }

    const result = reducedMotion
      ? { ...this.spinResult, speed: 'INSTANT' as const, reelDurationMs: 0, preRevealPauseMs: 0 }
      : this.spinResult;
    void this.finishDraw(reel, result, reducedMotion, generation);
    return true;
  }

  private async finishDraw(
    reel: PrizeDrawReelComponent,
    result: PrizeDrawReelResult,
    reducedMotion: boolean,
    generation: number,
  ): Promise<void> {
    await reel.play(result, reducedMotion);
    if (generation !== this.drawGeneration || reel.phase() !== 'complete') {
      return;
    }

    this.automaticDraw = false;
    this.drawState.set('winner');
    this.statusMessage.set(`Resultado: ${this.winnerName} ganhou ${this.prizeName}.`);
  }

  private cancelAutomaticDraw(): void {
    if (!this.automaticDraw || !this.isSpinning()) {
      return;
    }

    this.drawGeneration += 1;
    this.reel()?.reset([...PARTICIPANTS]);
    this.automaticDraw = false;
    this.drawState.set('ready');
    this.statusMessage.set('');
  }

  private reducedMotionRequested(): boolean {
    return this.prefersReducedMotion() || this.storybookPrefersReducedMotion();
  }

  private storybookPrefersReducedMotion(): boolean {
    return this.document.documentElement.dataset['storybookMotion'] === 'reduced';
  }
}
