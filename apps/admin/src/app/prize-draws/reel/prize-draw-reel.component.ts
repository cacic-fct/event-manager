import { isPlatformBrowser } from '@angular/common';
import { Component, OnDestroy, PLATFORM_ID, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { PrizeDrawSpinResult } from '@cacic-fct/event-manager-admin-contracts';
import { ScannerSoundsService } from '@cacic-fct/shared-angular/aztec-scanner';
import {
  PrizeDrawReelMotionStage,
  concealedPrizeDrawWinnerIndex,
  prizeDrawReelMotionStage,
  prizeDrawReelPlannedTickCount,
  prizeDrawReelSoundCadence,
  prizeDrawReelTickIntervalMs,
} from './prize-draw-reel-motion';

type ReelPhase = 'idle' | 'countdown' | 'spinning' | 'stopped' | 'complete' | 'reduced';
type VisibleName = {
  key: number;
  name: string;
  center: boolean;
  animationVariant: 'default' | 'alternate';
};

@Component({
  selector: 'app-prize-draw-reel',
  imports: [MatIconModule],
  templateUrl: './prize-draw-reel.component.html',
  styleUrl: './prize-draw-reel.component.scss',
})
export class PrizeDrawReelComponent implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly sounds = inject(ScannerSoundsService);
  readonly phase = signal<ReelPhase>('idle');
  readonly countdown = signal<number | null>(null);
  readonly visibleNames = signal<VisibleName[]>([]);
  readonly statusText = signal('Pronto para sortear');
  readonly motionStage = signal<PrizeDrawReelMotionStage>('idle');
  private generation = 0;
  private frameId: number | null = null;
  private activeAnimationResolve: (() => void) | null = null;
  private tick = 0;
  private currentCenterIndex: number | null = null;
  private currentNames: string[] = [];
  private reduceMotionRequested = false;

  async play(result: PrizeDrawSpinResult, reducedMotion: boolean): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const generation = ++this.generation;
    this.cancelFrame();
    this.reduceMotionRequested = reducedMotion;
    const names = result.reelNames.length ? result.reelNames : [result.winnerReelName];
    const winnerIndex = this.normalizeIndex(names.length, result.winnerReelIndex);
    const concealedIndex = concealedPrizeDrawWinnerIndex(names.length, winnerIndex);
    const countdownNames = names.filter((_, index) => index !== winnerIndex);
    if (result.countdownMs > 0) {
      this.setCenter(countdownNames.length ? countdownNames : ['Participante elegível'], concealedIndex);
    }

    if (result.countdownMs > 0) {
      this.phase.set('countdown');
      const seconds = Math.max(1, Math.round(result.countdownMs / 1000));
      for (let remaining = seconds; remaining > 0; remaining -= 1) {
        if (generation !== this.generation) return;
        this.countdown.set(remaining);
        this.statusText.set(`Sorteio em ${remaining}`);
        this.countdownStepTone();
        await this.wait(1000, generation);
      }
      this.countdown.set(null);
      this.phase.set('idle');
      this.statusText.set('');
      await this.wait(80, generation);
      if (generation !== this.generation) return;
      this.countdownCompleteTone();
    }

    if (this.reduceMotionRequested && result.speed !== 'INSTANT') {
      await this.finishReduced(names, winnerIndex, concealedIndex, generation);
      return;
    }

    if (result.reelDurationMs > 0) {
      this.phase.set('spinning');
      this.statusText.set('Sorteando');
      await this.animate(names, winnerIndex, result.speed, result.reelDurationMs, generation);
    } else {
      this.setCenter(names, winnerIndex);
    }
    if (generation !== this.generation) return;
    if (this.reduceMotionRequested && result.speed !== 'INSTANT') {
      await this.finishReduced(names, winnerIndex, concealedIndex, generation);
      return;
    }

    this.motionStage.set('settling');
    this.phase.set('stopped');
    this.statusText.set('');
    await this.wait(result.preRevealPauseMs, generation);
    if (generation !== this.generation) return;
    this.phase.set('complete');
    this.statusText.set('Resultado pronto');
    this.resultTone();
  }

  reset(names: string[] = []): void {
    this.generation += 1;
    this.cancelFrame();
    this.reduceMotionRequested = false;
    this.countdown.set(null);
    this.phase.set('idle');
    this.motionStage.set('idle');
    this.statusText.set(names.length ? 'Pronto para sortear' : 'Nenhuma pessoa elegível');
    this.setCenter(names, 0);
  }

  requestReducedMotion(): void {
    this.reduceMotionRequested = true;
  }

  ngOnDestroy(): void {
    this.generation += 1;
    this.cancelFrame();
  }

  private animate(
    names: string[],
    winnerIndex: number,
    speed: PrizeDrawSpinResult['speed'],
    durationMs: number,
    generation: number,
  ): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => {
        if (this.activeAnimationResolve !== resolve) return;
        this.activeAnimationResolve = null;
        resolve();
      };
      this.activeAnimationResolve = resolve;
      const startedAt = performance.now();
      const minimumTicks = prizeDrawReelPlannedTickCount(speed, durationMs);
      const preservesCurrentWindow = this.hasCurrentRoster(names) && this.currentCenterIndex !== null;
      const startIndex = this.currentCenterIndex ?? this.normalizeIndex(names.length, winnerIndex - minimumTicks);
      const plannedTicks = preservesCurrentWindow
        ? this.tickCountToWinner(names.length, startIndex, winnerIndex, minimumTicks)
        : minimumTicks;
      const tickSchedule = preservesCurrentWindow
        ? this.createTickSchedule(speed, durationMs, plannedTicks)
        : null;
      let appliedTicks = 0;
      let currentIndex = preservesCurrentWindow ? startIndex : this.normalizeIndex(names.length, winnerIndex - plannedTicks);
      if (!preservesCurrentWindow) this.setCenter(names, currentIndex);
      let nextTickAt = startedAt + (tickSchedule?.[0] ?? 0);
      const step = (now: number) => {
        if (generation !== this.generation || this.reduceMotionRequested) {
          this.frameId = null;
          finish();
          return;
        }
        const progress = Math.min(1, (now - startedAt) / Math.max(durationMs, 1));
        const motionStage = prizeDrawReelMotionStage(speed, progress);
        if (motionStage !== this.motionStage()) this.motionStage.set(motionStage);
        while (now >= nextTickAt && appliedTicks < plannedTicks) {
          const scheduledProgress = Math.min(
            1,
            (tickSchedule?.[appliedTicks] ?? nextTickAt - startedAt) / Math.max(durationMs, 1),
          );
          currentIndex = (currentIndex + 1) % names.length;
          this.setCenter(names, currentIndex);
          appliedTicks += 1;
          nextTickAt = tickSchedule
            ? startedAt + (tickSchedule[appliedTicks] ?? Number.POSITIVE_INFINITY)
            : nextTickAt + prizeDrawReelTickIntervalMs(speed, scheduledProgress);
          const cadence = prizeDrawReelSoundCadence(speed, scheduledProgress);
          if (appliedTicks % cadence === 0) this.tickTone(scheduledProgress);
        }
        if (progress >= 1) {
          if (this.currentCenterIndex !== winnerIndex) this.setCenter(names, winnerIndex);
          this.frameId = null;
          finish();
          return;
        }
        this.frameId = requestAnimationFrame(step);
      };
      this.frameId = requestAnimationFrame(step);
    });
  }

  private async finishReduced(
    names: string[],
    winnerIndex: number,
    concealedIndex: number,
    generation: number,
  ): Promise<void> {
    if (generation !== this.generation) return;
    this.cancelFrame();
    this.countdown.set(null);
    this.setCenter(names, concealedIndex);
    this.motionStage.set('settling');
    this.phase.set('reduced');
    this.statusText.set('Movimento reduzido');
    await this.wait(850, generation);
    if (generation !== this.generation) return;
    this.setCenter(names, winnerIndex);
    this.phase.set('complete');
    this.statusText.set('Resultado pronto');
    this.resultTone();
  }

  private setCenter(names: string[], rawCenter: number): void {
    if (names.length === 0) {
      this.visibleNames.set([]);
      this.currentNames = [];
      this.currentCenterIndex = null;
      return;
    }
    const center = ((rawCenter % names.length) + names.length) % names.length;
    this.currentCenterIndex = center;
    this.currentNames = [...names];
    this.tick += 1;
    const animationVariant = this.tick % 2 === 0 ? 'alternate' : 'default';
    this.visibleNames.set(
      [-2, -1, 0, 1, 2].map((offset) => {
        const index = (center + offset + names.length) % names.length;
        return { key: offset, name: names[index], center: offset === 0, animationVariant };
      }),
    );
  }

  private hasCurrentRoster(names: string[]): boolean {
    return names.length === this.currentNames.length && names.every((name, index) => name === this.currentNames[index]);
  }

  private tickCountToWinner(
    namesLength: number,
    startIndex: number,
    winnerIndex: number,
    minimumTicks: number,
  ): number {
    if (namesLength <= 1) return minimumTicks;
    const requiredRemainder = this.normalizeIndex(namesLength, winnerIndex - startIndex);
    const minimumRemainder = minimumTicks % namesLength;
    return minimumTicks + this.normalizeIndex(namesLength, requiredRemainder - minimumRemainder);
  }

  private createTickSchedule(
    speed: PrizeDrawSpinResult['speed'],
    durationMs: number,
    tickCount: number,
  ): number[] {
    if (tickCount <= 1) return [0];
    const rawOffsets = [0];
    let rawElapsed = 0;
    for (let tick = 1; tick < tickCount; tick += 1) {
      const progress = (tick - 1) / (tickCount - 1);
      rawElapsed += prizeDrawReelTickIntervalMs(speed, progress);
      rawOffsets.push(rawElapsed);
    }
    const scale = (durationMs * 0.985) / Math.max(rawElapsed, 1);
    return rawOffsets.map((offset) => offset * scale);
  }

  private wait(durationMs: number, generation: number): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || durationMs <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => resolve(), Math.max(0, durationMs));
      if (generation !== this.generation) {
        clearTimeout(timeout);
        resolve();
      }
    });
  }

  private normalizeIndex(namesLength: number, rawIndex: number): number {
    if (namesLength <= 0) return 0;
    return ((rawIndex % namesLength) + namesLength) % namesLength;
  }

  private tickTone(progress: number): void {
    this.sounds.tone(380 + progress * 320, 0.03, 0.8, 'triangle');
  }

  private countdownStepTone(): void {
    this.sounds.tone(420, 0.065, 0.8);
  }

  private countdownCompleteTone(): void {
    this.sounds.tone(560, 0.075, 0.9);
  }

  private resultTone(): void {
    this.sounds.tone(620, 0.09, 0.9);
    if (isPlatformBrowser(this.platformId)) window.setTimeout(() => this.sounds.tone(840, 0.13, 0.9), 100);
  }

  private cancelFrame(): void {
    if (this.frameId !== null && isPlatformBrowser(this.platformId)) cancelAnimationFrame(this.frameId);
    this.frameId = null;
    const resolve = this.activeAnimationResolve;
    this.activeAnimationResolve = null;
    resolve?.();
  }
}
