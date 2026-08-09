import { isPlatformBrowser } from '@angular/common';
import { Injectable, OnDestroy, PLATFORM_ID, computed, inject, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SportsBreathingAnimationService implements OnDestroy {
  private animationFrameId: number | null = null;
  private subscriberCount = 0;
  private readonly platformId = inject(PLATFORM_ID);

  readonly currentTime = signal(Date.now());

  readonly breathingBrightness = computed(() => sportsBreathingBrightness(this.currentTime()));

  readonly breathingOpacity = computed(() => this.breathingBrightness() / 100);

  ngOnDestroy(): void {
    this.stopAnimationLoop();
  }

  subscribe(): () => void {
    if (!isPlatformBrowser(this.platformId)) {
      return () => undefined;
    }

    this.subscriberCount++;
    if (this.subscriberCount === 1) {
      this.startAnimationLoop();
    }

    let subscribed = true;
    return () => {
      if (!subscribed) {
        return;
      }
      subscribed = false;
      this.subscriberCount--;
      if (this.subscriberCount === 0) {
        this.stopAnimationLoop();
      }
    };
  }

  private startAnimationLoop(): void {
    if (this.animationFrameId !== null) {
      return;
    }

    const animate = () => {
      this.currentTime.set(Date.now());
      this.animationFrameId = requestAnimationFrame(animate);
    };
    this.animationFrameId = requestAnimationFrame(animate);
  }

  private stopAnimationLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
}

export function sportsBreathingBrightness(now: number): number {
  const breathingPeriod = 5000;
  const gamma = 0.14;
  const beta = 0.5;
  const x = (now % breathingPeriod) / breathingPeriod;
  const exponent = -Math.pow((x - beta) / gamma, 2) / 2;
  const gaussianValue = Math.exp(exponent);
  const minBrightness = 15;
  const maxBrightness = 100;
  const brightness = minBrightness + gaussianValue * (maxBrightness - minBrightness);

  return Math.round(brightness);
}
