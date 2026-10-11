import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalOnline = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
const originalMatchMedia = window.matchMedia;

describe('Storybook browser environment', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('MediaQueryListEvent', class extends Event {
      readonly media: string;
      readonly matches: boolean;

      constructor(type: string, options: MediaQueryListEventInit) {
        super(type);
        this.media = options.media ?? '';
        this.matches = options.matches ?? false;
      }
    });
    window.matchMedia = vi.fn((query: string) => ({ media: query, matches: false }) as MediaQueryList);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.matchMedia = originalMatchMedia;
    if (originalOnline) Object.defineProperty(Navigator.prototype, 'onLine', originalOnline);
  });

  it('updates existing preference queries and notifies subscribers only on changes', async () => {
    const { applyStorybookEnvironment } = await import('./browser-environment');
    applyStorybookEnvironment({ theme: 'light', motion: 'full', network: 'online' });
    const dark = window.matchMedia('(prefers-color-scheme: dark)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onDarkChange = vi.fn();
    const onMotionChange = vi.fn();
    dark.addEventListener('change', onDarkChange);
    reducedMotion.addListener(onMotionChange);

    applyStorybookEnvironment({ theme: 'dark', motion: 'reduced', network: 'online' });
    expect(dark.matches).toBe(true);
    expect(reducedMotion.matches).toBe(true);
    expect(onDarkChange).toHaveBeenCalledWith(expect.objectContaining({ matches: true }));
    expect(onMotionChange).toHaveBeenCalledTimes(1);

    applyStorybookEnvironment({ theme: 'dark', motion: 'reduced', network: 'online' });
    expect(onDarkChange).toHaveBeenCalledTimes(1);
    reducedMotion.removeListener(onMotionChange);
    applyStorybookEnvironment({ theme: 'light', motion: 'full', network: 'online' });
    expect(onMotionChange).toHaveBeenCalledTimes(1);
  });

  it('forwards layout queries and emits online/offline events for existing network observers', async () => {
    const nativeMatchMedia = window.matchMedia;
    const { applyStorybookEnvironment } = await import('./browser-environment');
    applyStorybookEnvironment({ theme: 'light', motion: 'full', network: 'online' });
    window.matchMedia('(min-width: 600px)');
    expect(nativeMatchMedia).toHaveBeenCalledWith('(min-width: 600px)');
    const onOffline = vi.fn();
    window.addEventListener('offline', onOffline);
    try {
      applyStorybookEnvironment({ theme: 'light', motion: 'full', network: 'offline' });
      expect(navigator.onLine).toBe(false);
      expect(onOffline).toHaveBeenCalledTimes(1);
      applyStorybookEnvironment({ theme: 'light', motion: 'full', network: 'offline' });
      expect(onOffline).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('offline', onOffline);
    }
  });

  it('removes the modal background from focus and restores it when the dialog closes', async () => {
    const root = document.createElement('div');
    root.id = 'storybook-root';
    document.body.append(root);
    try {
      const { applyStorybookEnvironment } = await import('./browser-environment');
      applyStorybookEnvironment({ theme: 'light', motion: 'full', network: 'online' });
      root.setAttribute('aria-hidden', 'true');
      await Promise.resolve();
      expect(root.inert).toBe(true);
      root.removeAttribute('aria-hidden');
      await Promise.resolve();
      expect(root.inert).toBe(false);
    } finally {
      root.remove();
    }
  });

  it('waits for snackbar actions to become accessible before auditing the preview', async () => {
    const container = document.createElement('div');
    container.className = 'mat-mdc-snack-bar-container';
    container.innerHTML = '<div aria-hidden="true"><button>OK</button></div>';
    document.body.append(container);
    const frame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 0;
    });
    try {
      const { waitForStorybookAnnouncements } = await import('./browser-environment');
      let announced = false;
      const announcement = waitForStorybookAnnouncements().then(() => { announced = true; });
      await Promise.resolve();
      expect(announced).toBe(false);
      container.firstElementChild?.removeAttribute('aria-hidden');
      await announcement;
      expect(announced).toBe(true);
      expect(container.querySelector('[aria-hidden="true"] button')).toBeNull();
    } finally {
      frame.mockRestore();
      container.remove();
    }
  });

  it('restores the dialog trigger after clearing inert without stealing outside focus', async () => {
    const root = document.createElement('div');
    root.id = 'storybook-root';
    const trigger = document.createElement('button');
    root.append(trigger);
    const outside = document.createElement('input');
    document.body.append(root, outside);
    const frame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 0;
    });
    try {
      const { applyStorybookEnvironment } = await import('./browser-environment');
      applyStorybookEnvironment({ theme: 'light', motion: 'full', network: 'online' });
      trigger.focus();
      root.setAttribute('aria-hidden', 'true');
      await Promise.resolve();
      trigger.blur();
      root.removeAttribute('aria-hidden');
      await Promise.resolve();
      expect(document.activeElement).toBe(trigger);

      root.setAttribute('aria-hidden', 'true');
      await Promise.resolve();
      outside.focus();
      root.removeAttribute('aria-hidden');
      await Promise.resolve();
      expect(document.activeElement).toBe(outside);
    } finally {
      frame.mockRestore();
      root.remove();
      outside.remove();
    }
  });
});
