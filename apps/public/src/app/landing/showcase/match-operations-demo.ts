import { isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, PLATFORM_ID, afterNextRender, computed, inject, model, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

type MatchSide = 'home' | 'away';
type MatchState = 'PAUSED' | 'LIVE' | 'ENDED';

const INITIAL_CLOCK_MS = 12 * 60_000 + 34_000;

@Component({
  selector: 'app-landing-match-operations-demo',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './match-operations-demo.html',
  styleUrl: './match-operations-demo.scss',
})
export class MatchOperationsDemoComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private intervalId: number | undefined;
  private startedAtMonotonicMs: number | null = null;
  private elapsedBeforeStartMs = INITIAL_CLOCK_MS;

  readonly score = model({ home: 2, away: 1 });
  readonly state = model<MatchState>('LIVE');
  readonly elapsedMs = signal(INITIAL_CLOCK_MS);
  readonly elapsedLabel = computed(() => formatClock(this.elapsedMs()));
  readonly stateLabel = computed(() => {
    switch (this.state()) {
      case 'LIVE':
        return 'Partida em andamento';
      case 'ENDED':
        return 'Partida encerrada';
      default:
        return 'Partida pausada';
    }
  });
  readonly scoreAnnouncement = computed(
    () => `Placar: Compiladores ${this.score().home}, Algoritmos ${this.score().away}`,
  );

  constructor() {
    this.destroyRef.onDestroy(() => this.stopInterval());
    afterNextRender(() => {
      if (this.state() === 'LIVE') this.resumeClock();
    });
  }

  adjustScore(side: MatchSide, delta: -1 | 1): void {
    if (this.state() === 'ENDED') {
      return;
    }

    this.score.update((current) =>
      side === 'home'
        ? { ...current, home: Math.max(0, current.home + delta) }
        : { ...current, away: Math.max(0, current.away + delta) },
    );
  }

  toggleClock(): void {
    if (this.state() === 'LIVE') {
      this.pauseClock();
    } else if (this.state() === 'PAUSED') {
      this.resumeClock();
    }
  }

  finishMatch(): void {
    if (this.state() === 'ENDED') {
      return;
    }

    if (this.state() === 'LIVE') {
      this.pauseClock();
    }

    this.state.set('ENDED');
    this.stopInterval();
  }

  restartMatch(): void {
    this.stopInterval();
    this.startedAtMonotonicMs = null;
    this.elapsedBeforeStartMs = INITIAL_CLOCK_MS;
    this.elapsedMs.set(INITIAL_CLOCK_MS);
    this.score.set({ home: 2, away: 1 });
    this.state.set('LIVE');
    this.resumeClock();
  }

  private resumeClock(): void {
    if (!this.isBrowser || this.state() === 'ENDED' || this.intervalId !== undefined) {
      return;
    }

    this.startedAtMonotonicMs = window.performance.now();
    this.state.set('LIVE');
    this.intervalId = window.setInterval(() => this.updateElapsedTime(), 250);
  }

  private pauseClock(): void {
    if (this.state() !== 'LIVE') {
      return;
    }

    this.updateElapsedTime();
    this.elapsedBeforeStartMs = this.elapsedMs();
    this.startedAtMonotonicMs = null;
    this.stopInterval();
    this.state.set('PAUSED');
  }

  private updateElapsedTime(): void {
    if (!this.isBrowser || this.startedAtMonotonicMs === null) {
      return;
    }

    const runningMs = Math.max(0, window.performance.now() - this.startedAtMonotonicMs);
    this.elapsedMs.set(this.elapsedBeforeStartMs + runningMs);
  }

  private stopInterval(): void {
    if (this.intervalId === undefined) {
      return;
    }

    if (this.isBrowser) {
      window.clearInterval(this.intervalId);
    }
    this.intervalId = undefined;
  }
}

function formatClock(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
