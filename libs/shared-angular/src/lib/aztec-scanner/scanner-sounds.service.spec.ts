import '@angular/compiler';
import { EnvironmentInjector, PLATFORM_ID, createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { ScannerSoundsService } from './scanner-sounds.service';

describe('ScannerSoundsService', () => {
  const originalAudioContext = window.AudioContext;
  const originalWebkitAudioContext = window.webkitAudioContext;

  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
  });

  afterAll(() => {
    TestBed.resetTestEnvironment();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: originalAudioContext });
    Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: originalWebkitAudioContext });
  });

  it('builds and reuses a Web Audio graph for short custom tones', () => {
    const audio = audioContextFixture();
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: audio.AudioContext });
    const first = createService('browser');

    try {
      first.service.tone(440, 0.25, 0.5, 'triangle');
      first.service.tone(880, 0.1, 0.2);

      expect(audio.AudioContext).toHaveBeenCalledTimes(1);
      expect(audio.oscillator.type).toBe('sine');
      expect(audio.oscillator.frequency.value).toBe(880);
      expect(audio.gain.gain.setValueAtTime).toHaveBeenCalledWith(0.5, 10);
      expect(audio.gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 10.25);
      expect(audio.oscillator.start).toHaveBeenCalledTimes(2);
      expect(audio.oscillator.stop).toHaveBeenCalledWith(10.1);
      expect(audio.master.connect).toHaveBeenCalledWith(audio.compressor);
      expect(audio.compressor.connect).toHaveBeenCalledWith(audio.context.destination);
    } finally {
      first.injector.destroy();
    }
  });

  it('resumes a suspended context without waiting and contains resume failures', async () => {
    const audio = audioContextFixture({ state: 'suspended' });
    audio.context.resume.mockRejectedValue(new Error('gesture required'));
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: audio.AudioContext });
    const { injector, service } = createService('browser');

    try {
      expect(() => service.tone(440, 0.1, 0.3)).not.toThrow();
      await Promise.resolve();
      expect(audio.context.resume).toHaveBeenCalled();
      expect(audio.oscillator.start).toHaveBeenCalled();
    } finally {
      injector.destroy();
    }
  });

  it('is a no-op during SSR or when Web Audio is unavailable', () => {
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: undefined });
    Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: undefined });
    const server = createService('server');
    const browser = createService('browser');

    try {
      expect(() => server.service.tone(440, 0.1, 0.3)).not.toThrow();
      expect(() => browser.service.tone(440, 0.1, 0.3)).not.toThrow();
    } finally {
      server.injector.destroy();
      browser.injector.destroy();
    }
  });

  function createService(platformId: 'browser' | 'server') {
    const injector = createEnvironmentInjector(
      [{ provide: PLATFORM_ID, useValue: platformId }],
      TestBed.inject(EnvironmentInjector),
    );
    const service = runInInjectionContext(injector, () => new ScannerSoundsService());
    return { injector, service };
  }
});

function audioContextFixture(options: { state?: AudioContextState } = {}) {
  const gain = {
    gain: {
      value: 0,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(() => gain),
  };
  const oscillator = {
    type: 'sine' as OscillatorType,
    frequency: { value: 0 },
    connect: vi.fn(() => gain),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const master = { gain: { value: 0 }, connect: vi.fn() };
  const compressor = {
    threshold: { value: 0 },
    knee: { value: 0 },
    ratio: { value: 0 },
    attack: { value: 0 },
    release: { value: 0 },
    connect: vi.fn(),
  };
  const context = {
    currentTime: 10,
    state: options.state ?? 'running',
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    createOscillator: vi.fn(() => oscillator),
    createGain: vi
      .fn()
      .mockReturnValueOnce(master)
      .mockImplementation(() => gain),
    createDynamicsCompressor: vi.fn(() => compressor),
  };
  const AudioContext = vi.fn(function AudioContextMock() {
    return context;
  });
  return { AudioContext, compressor, context, gain, master, oscillator };
}
