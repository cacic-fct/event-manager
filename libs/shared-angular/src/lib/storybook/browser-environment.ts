interface StorybookEnvironment {
  theme: 'light' | 'dark';
  motion: 'full' | 'reduced';
  network: 'online' | 'offline';
}

const simulatedQueries = new Set([
  '(prefers-color-scheme:dark)',
  '(prefers-color-scheme:light)',
  '(prefers-reduced-motion:reduce)',
  '(prefers-reduced-motion:no-preference)',
]);

let environment: StorybookEnvironment;
const mediaQueries = new Map<string, StorybookMediaQueryList>();
let installed = false;
let observedRoot: HTMLElement | null = null;
let dialogObserver: MutationObserver | null = null;

function synchronizeDialogBackground(): void {
  const root = document.getElementById('storybook-root');
  if (!root || root === observedRoot) return;
  dialogObserver?.disconnect();
  observedRoot = root;
  // Material dialogs hide the preview behind their overlay. Storybook adds
  // focusable canvas content, so also remove that hidden background from focus.
  let lastRootFocus: HTMLElement | null = null;
  root.addEventListener('focusin', (event) => {
    if (event.target instanceof HTMLElement && !root.inert) lastRootFocus = event.target;
  });
  const synchronize = () => {
    const wasInert = root.inert;
    root.inert = root.getAttribute('aria-hidden') === 'true';
    if (wasInert && !root.inert) {
      // Material can restore focus before this observer clears inert. Retry
      // after rendering, but preserve any new focus chosen outside the preview.
      window.requestAnimationFrame(() => {
        if (!root.inert && document.activeElement === document.body && lastRootFocus?.isConnected) {
          lastRootFocus.focus();
        }
      });
    }
  };
  synchronize();
  dialogObserver = new MutationObserver(synchronize);
  dialogObserver.observe(root, { attributes: true, attributeFilter: ['aria-hidden'] });
}

/** Wait for Material to move snackbar actions into their announced live region. */
export async function waitForStorybookAnnouncements(): Promise<void> {
  await new Promise<void>((resolve) => { window.requestAnimationFrame(() => resolve()); });
  const pendingSelector = '.mat-mdc-snack-bar-container [aria-hidden="true"] button';
  if (!document.querySelector(pendingSelector)) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };
    const observer = new MutationObserver(() => {
      if (!document.querySelector(pendingSelector)) {
        cleanup();
        resolve();
      }
    });
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Snackbar actions remained hidden from assistive technology.'));
    }, 2_000);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-hidden'] });
  });
}

class StorybookMediaQueryList extends EventTarget implements MediaQueryList {
  onchange: MediaQueryList['onchange'] = null;

  constructor(readonly media: string) {
    super();
  }

  get matches(): boolean {
    switch (this.media.replace(/\s/g, '')) {
      case '(prefers-color-scheme:dark)': return environment.theme === 'dark';
      case '(prefers-color-scheme:light)': return environment.theme === 'light';
      case '(prefers-reduced-motion:reduce)': return environment.motion === 'reduced';
      default: return environment.motion === 'full';
    }
  }

  addListener(listener: Parameters<MediaQueryList['addListener']>[0]): void {
    if (listener) this.addEventListener('change', listener as EventListener);
  }

  removeListener(listener: Parameters<MediaQueryList['removeListener']>[0]): void {
    if (listener) this.removeEventListener('change', listener as EventListener);
  }

  notify(): void {
    const event = new MediaQueryListEvent('change', { media: this.media, matches: this.matches });
    this.dispatchEvent(event);
    this.onchange?.call(this, event);
  }
}

/** Keep browser APIs used by components in sync with Storybook's toolbar. */
export function applyStorybookEnvironment(next: StorybookEnvironment): void {
  synchronizeDialogBackground();
  const previousOnline = navigator.onLine;
  const previousMatches = new Map([...mediaQueries].map(([query, list]) => [query, list.matches]));
  environment = next;

  if (!installed) {
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      if (!simulatedQueries.has(query.replace(/\s/g, ''))) return nativeMatchMedia(query);
      let list = mediaQueries.get(query);
      if (!list) {
        list = new StorybookMediaQueryList(query);
        mediaQueries.set(query, list);
      }
      return list;
    };
    Object.defineProperty(Navigator.prototype, 'onLine', {
      configurable: true,
      get: () => environment.network === 'online',
    });
    installed = true;
  }

  for (const [query, list] of mediaQueries) {
    if (previousMatches.get(query) !== list.matches) list.notify();
  }
  if (previousOnline !== navigator.onLine) window.dispatchEvent(new Event(next.network));
}
