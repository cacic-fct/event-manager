import '@angular/compiler';
import { EnvironmentInjector, PLATFORM_ID, createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import { PublicMapTileCacheWarmupService, openStreetMapTileWarmupUrls } from './public-map-tile-cache-warmup.service';

interface PostedServiceWorkerMessage {
  type: string;
  urls: string[];
}

interface TestMessageEvent {
  data: unknown;
}

class TestMessagePort {
  onmessage: ((event: TestMessageEvent) => void) | null = null;
  peer: TestMessagePort | null = null;
  readonly close = vi.fn();

  postMessage(data: unknown): void {
    this.peer?.onmessage?.({ data });
  }
}

class TestMessageChannel {
  readonly port1 = new TestMessagePort();
  readonly port2 = new TestMessagePort();

  constructor() {
    this.port1.peer = this.port2;
    this.port2.peer = this.port1;
  }
}

describe('PublicMapTileCacheWarmupService', () => {
  const injectors: EnvironmentInjector[] = [];

  beforeEach(() => {
    vi.stubGlobal('MessageChannel', TestMessageChannel);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'serviceWorker');
    injectors.splice(0).forEach((injector) => injector.destroy());
  });

  it('builds a bounded cross of overview and detail tiles', () => {
    const urls = openStreetMapTileWarmupUrls(-22.1211, -51.4086);

    expect(urls).toHaveLength(10);
    expect(new Set(urls).size).toBe(10);
    expect(urls.every((url) => /^https:\/\/tile\.openstreetmap\.org\/(16|18)\/\d+\/\d+\.png$/.test(url))).toBe(true);
  });

  it('shares successful warmups without posting the same location twice', async () => {
    const postMessage = installServiceWorkerMock((_message, transfer) => {
      (transfer[0] as TestMessagePort).postMessage({ type: 'CACHE_MAP_TILES_RESULT', ok: true });
    });
    const service = createService('browser');

    await expect(service.warmLocation(-22.1211, -51.4086)).resolves.toBe(true);
    await expect(service.warmLocation(-22.1211, -51.4086)).resolves.toBe(true);

    expect(postMessage).toHaveBeenCalledOnce();
    expect(postMessage.mock.calls[0][0]).toEqual({
      type: 'CACHE_MAP_TILES',
      urls: openStreetMapTileWarmupUrls(-22.1211, -51.4086),
    });
  });

  it('retries failed warmups and ignores offline, invalid, and server-side requests', async () => {
    let succeeds = false;
    const postMessage = installServiceWorkerMock((_message, transfer) => {
      (transfer[0] as TestMessagePort).postMessage({ type: 'CACHE_MAP_TILES_RESULT', ok: succeeds });
    });
    const browserService = createService('browser');

    await expect(browserService.warmLocation(-22.1211, -51.4086)).resolves.toBe(false);
    succeeds = true;
    await expect(browserService.warmLocation(-22.1211, -51.4086)).resolves.toBe(true);
    await expect(browserService.warmLocation(Number.NaN, -51.4086)).resolves.toBe(false);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    await expect(browserService.warmLocation(-22.1211, -51.4086)).resolves.toBe(false);
    await expect(createService('server').warmLocation(-22.1211, -51.4086)).resolves.toBe(false);

    expect(postMessage).toHaveBeenCalledTimes(2);
  });

  function createService(platformId: 'browser' | 'server'): PublicMapTileCacheWarmupService {
    const injector = createEnvironmentInjector(
      [{ provide: PLATFORM_ID, useValue: platformId }],
      null as unknown as EnvironmentInjector,
    );
    injectors.push(injector);
    return runInInjectionContext(injector, () => new PublicMapTileCacheWarmupService());
  }
});

function installServiceWorkerMock(
  handler: (message: PostedServiceWorkerMessage, transfer: Transferable[]) => void,
): ReturnType<typeof vi.fn> {
  const postMessage = vi.fn((message: PostedServiceWorkerMessage, transfer: Transferable[]) => {
    handler(message, transfer);
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve({ active: { postMessage } } as unknown as ServiceWorkerRegistration),
      controller: null,
    } satisfies Partial<ServiceWorkerContainer>,
  });
  return postMessage;
}
