import { Component, OnDestroy, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { PrizeDrawSpinResult } from '@cacic-fct/event-manager-admin-contracts';
import {
  PrizeDrawReelMotionStage,
  concealedPrizeDrawWinnerIndex,
  prizeDrawReelMotionStage,
  prizeDrawReelPlannedTickCount,
  prizeDrawReelSoundCadence,
  prizeDrawReelTickIntervalMs,
} from './prize-draw-reel-motion';

type ReelPhase = 'idle' | 'countdown' | 'spinning' | 'stopped' | 'complete' | 'reduced';
type VisibleName = { key: string; name: string; center: boolean };

@Component({
  selector: 'app-prize-draw-reel',
  imports: [MatIconModule],
  templateUrl: './prize-draw-reel.component.html',
  styleUrl: './prize-draw-reel.component.scss',
})
export class PrizeDrawReelComponent implements OnDestroy {
  readonly phase = signal<ReelPhase>('idle');
  readonly countdown = signal<number | null>(null);
  readonly visibleNames = signal<VisibleName[]>([]);
  readonly statusText = signal('Pronto para sortear');
  readonly motionStage = signal<PrizeDrawReelMotionStage>('idle');
  private generation = 0;
  private frameId: number | null = null;
  private activeAnimationResolve: (() => void) | null = null;
  private audioContext: AudioContext | null = null;
  private tick = 0;
  private currentCenterIndex: number | null = null;
  private reduceMotionRequested = false;

  async play(result: PrizeDrawSpinResult, reducedMotion: boolean): Promise<void> {
    const generation = ++this.generation;
    this.cancelFrame();
    this.tick = 0;
    this.reduceMotionRequested = reducedMotion;
    const names = result.reelNames.length ? result.reelNames : [result.winnerReelName];
    const winnerIndex = this.normalizeIndex(names.length, result.winnerReelIndex);
    const concealedIndex = concealedPrizeDrawWinnerIndex(names.length, winnerIndex);
    const countdownNames = names.filter((_, index) => index !== winnerIndex);
    this.setCenter(result.countdownMs > 0 ? (countdownNames.length ? countdownNames : ['Participante elegível']) : names, concealedIndex);

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
    void this.audioContext?.close().catch(() => undefined);
  }

  private animate(
    names: string[],
    winnerIndex: number,
    speed: PrizeDrawSpinResult['speed'],
    durationMs: number,
    generation: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      const finish = () => {
        if (this.activeAnimationResolve !== finish) return;
        this.activeAnimationResolve = null;
        resolve();
      };
      this.activeAnimationResolve = finish;
      const startedAt = performance.now();
      const plannedTicks = prizeDrawReelPlannedTickCount(speed, durationMs);
      let appliedTicks = 0;
      let currentIndex = this.normalizeIndex(names.length, winnerIndex - plannedTicks);
      this.setCenter(names, currentIndex);
      let nextTickAt = startedAt;
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
          const scheduledProgress = Math.min(1, (nextTickAt - startedAt) / Math.max(durationMs, 1));
          currentIndex = (currentIndex + 1) % names.length;
          this.setCenter(names, currentIndex);
          appliedTicks += 1;
          nextTickAt += prizeDrawReelTickIntervalMs(speed, scheduledProgress);
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
      this.currentCenterIndex = null;
      return;
    }
    const center = ((rawCenter % names.length) + names.length) % names.length;
    this.currentCenterIndex = center;
    this.tick += 1;
    this.visibleNames.set(
      [-2, -1, 0, 1, 2].map((offset) => {
        const index = (center + offset + names.length) % names.length;
        return { key: `${this.tick}:${offset}`, name: names[index], center: offset === 0 };
      }),
    );
  }

  private wait(durationMs: number, generation: number): Promise<void> {
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
    this.tone(380 + progress * 320, 0.03, 0.07, 'triangle');
  }

  private countdownStepTone(): void {
    this.tone(420, 0.065, 0.08);
  }

  private countdownCompleteTone(): void {
    this.tone(560, 0.075, 0.09);
  }

  private resultTone(): void {
    this.tone(620, 0.09, 0.11);
    window.setTimeout(() => this.tone(840, 0.13, 0.1), 100);
  }

  private tone(
    frequency: number,
    durationSeconds: number,
    volume: number,
    type: OscillatorType = 'sine',
  ): void {
    try {
      this.audioContext ??= new AudioContext();
      const oscillator = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.audioContext.currentTime + durationSeconds);
      oscillator.connect(gain).connect(this.audioContext.destination);
      oscillator.start();
      oscillator.stop(this.audioContext.currentTime + durationSeconds);
    } catch {
      // Audio is a progressive enhancement and may be unavailable in the browser.
    }
  }

  private cancelFrame(): void {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
    const resolve = this.activeAnimationResolve;
    this.activeAnimationResolve = null;
    resolve?.();
  }
}
