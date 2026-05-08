import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type ScannerSoundKind =
  | 'valid'
  | 'invalid'
  | 'duplicate'
  | 'nonPaying'
  | 'nonSubscribed';

type ToneOptions = {
  start?: number;
  duration?: number;
  frequency?: number;
  endFrequency?: number;
  volume?: number;
  type?: OscillatorType;
};

type BrowserAudioContextConstructor = typeof AudioContext;

declare global {
  interface Window {
    webkitAudioContext?: BrowserAudioContextConstructor;
  }
}

@Injectable({
  providedIn: 'root',
})
export class ScannerSoundsService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private audioContext: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;

  async play(kind: ScannerSoundKind): Promise<void> {
    switch (kind) {
      case 'valid':
        await this.valid();
        break;

      case 'invalid':
        await this.invalid();
        break;

      case 'duplicate':
        await this.duplicate();
        break;

      case 'nonPaying':
        await this.nonPaying();
        break;

      case 'nonSubscribed':
        await this.nonSubscribed();
        break;
    }
  }

  async valid(): Promise<void> {
    if (!(await this.ensureAudio())) {
      return;
    }

    this.makeTone({
      duration: 0.105,
      frequency: 490,
      volume: 0.8,
      type: 'sine',
    });
    this.makeTone({
      start: 0.1,
      duration: 0.12,
      frequency: 880,
      volume: 0.9,
      type: 'sine',
    });
  }

  async invalid(): Promise<void> {
    if (!(await this.ensureAudio())) {
      return;
    }

    this.makeTone({
      duration: 0.16,
      frequency: 360,
      endFrequency: 300,
      volume: 0.9,
      type: 'triangle',
    });

    this.makeTone({
      start: 0.2,
      duration: 0.18,
      frequency: 300,
      endFrequency: 240,
      volume: 0.9,
      type: 'triangle',
    });
  }

  async duplicate(): Promise<void> {
    if (!(await this.ensureAudio())) {
      return;
    }

    for (const start of [0, 0.11, 0.22]) {
      this.makeTone({
        start,
        duration: 0.075,
        frequency: 950,
        volume: 0.8,
        type: 'sine',
      });
    }
  }

  async nonPaying(): Promise<void> {
    if (!(await this.ensureAudio())) {
      return;
    }

    this.makeTone({
      duration: 0.1,
      frequency: 1200,
      volume: 0.85,
      type: 'sine',
    });

    this.makeTone({
      start: 0.13,
      duration: 0.24,
      frequency: 520,
      endFrequency: 440,
      volume: 0.9,
      type: 'sine',
    });
  }

  async nonSubscribed(): Promise<void> {
    if (!(await this.ensureAudio())) {
      return;
    }

    this.makeTone({
      duration: 0.09,
      frequency: 1150,
      volume: 0.8,
      type: 'sine',
    });

    this.makeTone({
      start: 0.12,
      duration: 0.09,
      frequency: 850,
      volume: 0.8,
      type: 'sine',
    });

    this.makeTone({
      start: 0.24,
      duration: 0.14,
      frequency: 650,
      volume: 0.82,
      type: 'sine',
    });
  }

  private async ensureAudio(): Promise<boolean> {
    if (!this.isBrowser) {
      return false;
    }

    if (!this.audioContext) {
      const AudioContextClass =
        window.AudioContext ?? window.webkitAudioContext;

      if (!AudioContextClass) {
        return false;
      }

      const audioContext = new AudioContextClass();

      const master = audioContext.createGain();
      const compressor = audioContext.createDynamicsCompressor();

      master.gain.value = 0.9;

      compressor.threshold.value = -10;
      compressor.knee.value = 4;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.001;
      compressor.release.value = 0.08;

      master.connect(compressor);
      compressor.connect(audioContext.destination);

      this.audioContext = audioContext;
      this.master = master;
      this.compressor = compressor;
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    return true;
  }

  private makeTone({
    start = 0,
    duration = 0.14,
    frequency = 1200,
    endFrequency = frequency,
    volume = 0.75,
    type = 'sine',
  }: ToneOptions): void {
    const audioContext = this.audioContext;
    const master = this.master;

    if (!audioContext || !master) {
      return;
    }

    const now = audioContext.currentTime + start;

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    const highpass = audioContext.createBiquadFilter();
    const presence = audioContext.createBiquadFilter();

    oscillator.type = type;

    oscillator.frequency.setValueAtTime(frequency, now);

    if (endFrequency !== frequency) {
      oscillator.frequency.linearRampToValueAtTime(
        endFrequency,
        now + duration,
      );
    }

    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(250, now);
    highpass.Q.value = 0.7;

    presence.type = 'highshelf';
    presence.frequency.setValueAtTime(1800, now);
    presence.gain.setValueAtTime(5, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.003);
    gain.gain.setValueAtTime(volume, now + duration * 0.7);
    gain.gain.linearRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(highpass);
    highpass.connect(presence);
    presence.connect(gain);
    gain.connect(master);

    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }
}
