import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type RouteMatcher = (context: { request: Pick<Request, 'destination' | 'method' | 'mode'>; url: URL }) => boolean;
type RouteHandler = ((options: unknown) => Promise<Response>) | { handle(options: unknown): Promise<Response> };

interface RegisteredRoute {
  matcher: RouteMatcher;
  handler: RouteHandler;
  method?: string;
}

interface WaitUntilEvent {
  waitUntil(promise: Promise<unknown>): void;
}

interface WorkerMessageEvent extends WaitUntilEvent {
  data?: {
    type?: string;
    urls?: unknown;
  };
  ports?: Array<{
    postMessage(message: unknown): void;
  }>;
  source?: {
    id?: string;
  };
}

interface WorkerNotificationEvent extends WaitUntilEvent {
  notification: {
    data?: {
      url?: unknown;
    };
    close(): void;
  };
}

interface WorkerListenerMap {
  install: Array<(event: WaitUntilEvent) => void>;
  message: Array<(event: WorkerMessageEvent) => void>;
  notificationclick: Array<(event: WorkerNotificationEvent) => void>;
}

interface MockCache {
  put: ReturnType<typeof vi.fn<(request: Request, response: Response) => Promise<void>>>;
}

interface MockCacheExpiration {
  cacheName: string;
  config: Record<string, unknown>;
  updateTimestamp: ReturnType<typeof vi.fn<(url: string) => Promise<void>>>;
}

interface WorkerHarness {
  listeners: WorkerListenerMap;
  routes: RegisteredRoute[];
  catchHandler: ((options: { request: Pick<Request, 'mode'> }) => Promise<Response>) | null;
  networkFirstInstances: MockNetworkFirst[];
  cacheFirstInstances: MockCacheFirst[];
  cacheExpirations: MockCacheExpiration[];
  fetchMock: ReturnType<typeof vi.fn<(request: Request) => Promise<Response>>>;
  caches: {
    match: ReturnType<typeof vi.fn<(request: RequestInfo | URL) => Promise<Response | undefined>>>;
    open: ReturnType<typeof vi.fn<(cacheName: string) => Promise<MockCache>>>;
  };
  openedCaches: Map<string, MockCache>;
  workbox: {
    precaching: {
      matchPrecache: ReturnType<typeof vi.fn<(url: string) => Promise<Response | undefined>>>;
    };
  };
}

class MockNetworkOnly {
  readonly strategyName = 'NetworkOnly';

  async handle(): Promise<Response> {
    return new Response('', { status: 204 });
  }
}

class MockNetworkFirst {
  readonly strategyName = 'NetworkFirst';
  readonly handle = vi.fn<() => Promise<Response>>(async () => new Response('network'));

  constructor(readonly options: Record<string, unknown>) {}
}

class MockCacheFirst {
  readonly strategyName = 'CacheFirst';

  constructor(readonly options: Record<string, unknown>) {}
}

function loadWorkerSource(): string {
  return readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'cacic-public-worker.js'), 'utf8');
}

function createWorkerHarness(): WorkerHarness {
  const listeners: WorkerListenerMap = {
    install: [],
    message: [],
    notificationclick: [],
  };
  const routes: RegisteredRoute[] = [];
  const networkFirstInstances: MockNetworkFirst[] = [];
  const cacheFirstInstances: MockCacheFirst[] = [];
  const cacheExpirations: MockCacheExpiration[] = [];
  const openedCaches = new Map<string, MockCache>();
  let catchHandler: WorkerHarness['catchHandler'] = null;

  const caches = {
    match: vi.fn<(request: RequestInfo | URL) => Promise<Response | undefined>>(),
    open: vi.fn(async (cacheName: string) => {
      const existing = openedCaches.get(cacheName);
      if (existing) {
        return existing;
      }

      const cache: MockCache = {
        put: vi.fn<(request: Request, response: Response) => Promise<void>>(async () => undefined),
      };
      openedCaches.set(cacheName, cache);
      return cache;
    }),
  };

  const workbox = {
    setConfig: vi.fn(),
    core: {
      setCacheNameDetails: vi.fn(),
      clientsClaim: vi.fn(),
    },
    precaching: {
      precacheAndRoute: vi.fn(),
      cleanupOutdatedCaches: vi.fn(),
      matchPrecache: vi.fn<(url: string) => Promise<Response | undefined>>(),
    },
    strategies: {
      NetworkOnly: MockNetworkOnly,
      NetworkFirst: class extends MockNetworkFirst {
        constructor(options: Record<string, unknown>) {
          super(options);
          networkFirstInstances.push(this);
        }
      },
      CacheFirst: class extends MockCacheFirst {
        constructor(options: Record<string, unknown>) {
          super(options);
          cacheFirstInstances.push(this);
        }
      },
    },
    expiration: {
      ExpirationPlugin: class {
        constructor(readonly options: Record<string, unknown>) {}
      },
      CacheExpiration: class implements MockCacheExpiration {
        readonly updateTimestamp = vi.fn<(url: string) => Promise<void>>(async () => undefined);

        constructor(
          readonly cacheName: string,
          readonly config: Record<string, unknown>,
        ) {
          cacheExpirations.push(this);
        }
      },
    },
    cacheableResponse: {
      CacheableResponsePlugin: class {
        constructor(readonly options: Record<string, unknown>) {}
      },
    },
    routing: {
      registerRoute: vi.fn((matcher: RouteMatcher, handler: RouteHandler, method?: string) => {
        routes.push({ matcher, handler, method });
      }),
      setCatchHandler: vi.fn((handler: WorkerHarness['catchHandler']) => {
        catchHandler = handler;
      }),
    },
  };

  const workerGlobal = {
    __WB_MANIFEST: [],
    location: new URL('https://eventos.example/app/cacic-public-worker.js'),
    registration: {
      scope: 'https://eventos.example/app/',
    },
    clients: {
      get: vi.fn(),
      matchAll: vi.fn(async () => []),
      openWindow: vi.fn(),
    },
    skipWaiting: vi.fn(async () => undefined),
    addEventListener: vi.fn((type: keyof WorkerListenerMap, listener: never) => {
      listeners[type].push(listener);
    }),
  };
  const fetchMock = vi.fn<(request: Request) => Promise<Response>>();

  const evaluate = new Function(
    'self',
    'workbox',
    'caches',
    'importScripts',
    'Response',
    'Request',
    'fetch',
    loadWorkerSource(),
  );

  evaluate(workerGlobal, workbox, caches, vi.fn(), Response, Request, fetchMock);

  return {
    listeners,
    routes,
    get catchHandler() {
      return catchHandler;
    },
    networkFirstInstances,
    cacheFirstInstances,
    cacheExpirations,
    fetchMock,
    caches,
    openedCaches,
    workbox,
  };
}

function requestContext(url: string, request: Partial<Pick<Request, 'destination' | 'method' | 'mode'>> = {}) {
  return {
    url: new URL(url, 'https://eventos.example'),
    request: {
      destination: '',
      method: 'GET',
      mode: 'same-origin',
      ...request,
    },
  };
}

async function dispatchMessage(harness: WorkerHarness, event: Omit<WorkerMessageEvent, 'waitUntil'>): Promise<void> {
  const pending: Array<Promise<unknown>> = [];
  harness.listeners.message[0]({
    ...event,
    waitUntil: (promise) => {
      pending.push(promise);
    },
  });

  await Promise.all(pending);
}

describe('cacic-public-worker', () => {
  it('registers the expected runtime routes for private traffic and offline navigations', () => {
    const harness = createWorkerHarness();

    const authGetRoute = harness.routes.find((route) => route.method === 'GET' && route.matcher(requestContext('/api/auth/me')));
    const graphqlPostRoute = harness.routes.find(
      (route) => route.method === 'POST' && route.matcher(requestContext('/api/graphql')),
    );
    const certificateRoute = harness.routes.find((route) =>
      route.matcher(requestContext('/api/current-user/certificates/event.pdf')),
    );
    const navigationRoute = harness.routes.find((route) =>
      route.matcher(requestContext('/app/major-event', { mode: 'navigate' })),
    );

    expect(authGetRoute?.handler).toBeInstanceOf(MockNetworkOnly);
    expect(graphqlPostRoute?.handler).toBeInstanceOf(MockNetworkOnly);
    expect(certificateRoute?.handler).toBeInstanceOf(MockNetworkOnly);
    expect(navigationRoute).toBeDefined();
    expect(navigationRoute?.matcher(requestContext('/api/graphql', { mode: 'navigate' }))).toBe(false);
    expect(navigationRoute?.matcher(requestContext('/api/auth/login', { mode: 'navigate' }))).toBe(false);
  });

  it('returns the precached CSR shell when an offline navigation misses the network', async () => {
    const harness = createWorkerHarness();
    const navigationRoute = harness.routes.find((route) =>
      route.matcher(requestContext('/app/about', { mode: 'navigate' })),
    );
    const ssrStrategy = harness.networkFirstInstances[0];

    ssrStrategy.handle.mockRejectedValueOnce(new Error('offline'));
    harness.workbox.precaching.matchPrecache.mockResolvedValueOnce(new Response('csr-shell'));

    expect(typeof navigationRoute?.handler).toBe('function');
    const response = await (navigationRoute?.handler as (options: unknown) => Promise<Response>)(
      requestContext('/app/about', { mode: 'navigate' }),
    );

    await expect(response.text()).resolves.toBe('csr-shell');
    expect(harness.workbox.precaching.matchPrecache).toHaveBeenCalledWith('/app/index.csr.html');
  });

  it('uses the CSR shell from Cache Storage if Workbox precache lookup misses', async () => {
    const harness = createWorkerHarness();
    const navigationRoute = harness.routes.find((route) =>
      route.matcher(requestContext('/app/about', { mode: 'navigate' })),
    );

    harness.networkFirstInstances[0].handle.mockRejectedValueOnce(new Error('offline'));
    harness.workbox.precaching.matchPrecache.mockResolvedValueOnce(undefined);
    harness.caches.match.mockResolvedValueOnce(new Response('cached-shell'));

    expect(typeof navigationRoute?.handler).toBe('function');
    const response = await (navigationRoute?.handler as (options: unknown) => Promise<Response>)(
      requestContext('/app/about', { mode: 'navigate' }),
    );

    await expect(response.text()).resolves.toBe('cached-shell');
    expect(harness.caches.match).toHaveBeenCalledWith('/app/index.csr.html');
  });

  it('reports scanner-cache success only after every requested URL is cached', async () => {
    const harness = createWorkerHarness();
    const replies: unknown[] = [];
    const sameOriginUrl = 'https://eventos.example/app/attendance/collect/evento-1';
    const wasmUrl = 'https://cdn.jsdelivr.net/npm/zxing-wasm@3.1.0/dist/full/zxing_full.wasm';

    harness.fetchMock.mockResolvedValue(new Response('ok', { status: 200 }));

    await dispatchMessage(harness, {
      data: {
        type: 'CACHE_ATTENDANCE_SCANNER',
        urls: [sameOriginUrl, wasmUrl],
      },
      ports: [{ postMessage: (message) => replies.push(message) }],
    });

    expect(replies).toEqual([{ type: 'CACHE_ATTENDANCE_SCANNER_RESULT', ok: true }]);
    expect(harness.caches.open).toHaveBeenCalledWith('ssr-html');
    expect(harness.caches.open).toHaveBeenCalledWith('zxing-wasm');
    expect(harness.openedCaches.get('ssr-html')?.put).toHaveBeenCalledWith(expect.any(Request), expect.any(Response));
    expect(harness.openedCaches.get('zxing-wasm')?.put).toHaveBeenCalledWith(expect.any(Request), expect.any(Response));
    expect(harness.cacheExpirations).toHaveLength(1);
    expect(harness.cacheExpirations[0].cacheName).toBe('zxing-wasm');
    expect(harness.cacheExpirations[0].updateTimestamp).toHaveBeenCalledWith(wasmUrl);
  });

  it('rejects private scanner-cache responses and reports failure to the client', async () => {
    const harness = createWorkerHarness();
    const replies: unknown[] = [];

    harness.fetchMock.mockResolvedValue(
      new Response('private', {
        status: 200,
        headers: {
          'Cache-Control': 'private, max-age=0',
        },
      }),
    );

    await dispatchMessage(harness, {
      data: {
        type: 'CACHE_ATTENDANCE_SCANNER',
        urls: ['https://eventos.example/app/attendance/collect/evento-privado'],
      },
      ports: [{ postMessage: (message) => replies.push(message) }],
    });

    expect(replies).toEqual([{ type: 'CACHE_ATTENDANCE_SCANNER_RESULT', ok: false }]);
    expect(harness.caches.open).not.toHaveBeenCalled();
  });

  it('rejects untrusted cross-origin scanner-cache URLs', async () => {
    const harness = createWorkerHarness();
    const replies: unknown[] = [];

    await dispatchMessage(harness, {
      data: {
        type: 'CACHE_ATTENDANCE_SCANNER',
        urls: ['https://example.invalid/not-allowed.js'],
      },
      ports: [{ postMessage: (message) => replies.push(message) }],
    });

    expect(replies).toEqual([{ type: 'CACHE_ATTENDANCE_SCANNER_RESULT', ok: false }]);
    expect(harness.fetchMock).not.toHaveBeenCalled();
    expect(harness.caches.open).not.toHaveBeenCalled();
  });
});
