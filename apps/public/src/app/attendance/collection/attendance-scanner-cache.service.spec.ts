import { DOCUMENT } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { prepareZXingModule, ZXING_WASM_VERSION } from 'zxing-wasm';

import { AttendanceScannerCacheService } from './attendance-scanner-cache.service';
import type { AttendanceCollectionEvent } from './attendance-collection-api.service';

vi.mock('zxing-wasm', () => ({
  prepareZXingModule: vi.fn(() => Promise.resolve()),
  ZXING_WASM_VERSION: '3.1.0',
}));

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

function eventFixture(eventId: string): AttendanceCollectionEvent {
  return {
    eventId,
    event: {
      id: eventId,
      name: `Evento ${eventId}`,
      startDate: '2026-06-26T14:00:00.000Z',
      endDate: '2026-06-26T16:00:00.000Z',
      emoji: '',
      type: 'OTHER',
      locationDescription: 'Auditório',
      majorEventId: null,
      eventGroupId: null,
      majorEvent: null,
      eventGroup: null,
    },
  };
}

function installServiceWorkerMock(
  handler: (message: PostedServiceWorkerMessage, transfer: Transferable[]) => void,
): ReturnType<typeof vi.fn> {
  const postMessage = vi.fn((message: PostedServiceWorkerMessage, transfer: Transferable[]) => {
    handler(message, transfer);
  });
  const activeWorker = { postMessage } as Pick<ServiceWorker, 'postMessage'>;
  const serviceWorkerContainer = {
    ready: Promise.resolve({
      active: activeWorker,
    } as ServiceWorkerRegistration),
    controller: null,
  } as Partial<ServiceWorkerContainer>;

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: serviceWorkerContainer,
  });

  return postMessage;
}

describe('AttendanceScannerCacheService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DOCUMENT,
          useValue: {
            baseURI: 'https://eventos.example/app/',
          },
        },
        {
          provide: PLATFORM_ID,
          useValue: 'browser',
        },
      ],
    });

    vi.stubGlobal('MessageChannel', TestMessageChannel);
    vi.mocked(prepareZXingModule).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'serviceWorker');
    TestBed.resetTestingModule();
  });

  it('asks the service worker to warm attendance scanner pages and ZXing WASM URLs', async () => {
    const postMessage = installServiceWorkerMock((_message, transfer) => {
      const port = transfer[0] as TestMessagePort;
      port.postMessage({ type: 'CACHE_ATTENDANCE_SCANNER_RESULT', ok: true });
    });
    const service = TestBed.inject(AttendanceScannerCacheService);

    await service.cacheAttendanceCollection([eventFixture('evento 1')]);

    expect(prepareZXingModule).toHaveBeenCalledWith({ fireImmediately: true });
    expect(postMessage).toHaveBeenCalledTimes(1);
    const [message] = postMessage.mock.calls[0];
    expect(message).toEqual({
      type: 'CACHE_ATTENDANCE_SCANNER',
      urls: [
        'https://eventos.example/app/attendance/collect',
        'https://eventos.example/app/attendance/collect/evento%201',
        `https://fastly.jsdelivr.net/npm/zxing-wasm@${ZXING_WASM_VERSION}/dist/full/zxing_full.wasm`,
        `https://cdn.jsdelivr.net/npm/zxing-wasm@${ZXING_WASM_VERSION}/dist/full/zxing_full.wasm`,
      ],
    });
  });

  it('does not ask the service worker again after a successful warmup', async () => {
    const postMessage = installServiceWorkerMock((_message, transfer) => {
      const port = transfer[0] as TestMessagePort;
      port.postMessage({ type: 'CACHE_ATTENDANCE_SCANNER_RESULT', ok: true });
    });
    const service = TestBed.inject(AttendanceScannerCacheService);
    const events = [eventFixture('evento-1')];

    await service.cacheAttendanceCollection(events);
    await service.cacheAttendanceCollection(events);

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(prepareZXingModule).toHaveBeenCalledTimes(1);
  });

  it('retries an event when the service worker reports that cache warming failed', async () => {
    let shouldSucceed = false;
    const postMessage = installServiceWorkerMock((_message, transfer) => {
      const port = transfer[0] as TestMessagePort;
      port.postMessage({ type: 'CACHE_ATTENDANCE_SCANNER_RESULT', ok: shouldSucceed });
    });
    const service = TestBed.inject(AttendanceScannerCacheService);
    const events = [eventFixture('evento-instavel')];

    await service.cacheAttendanceCollection(events);
    shouldSucceed = true;
    await service.cacheAttendanceCollection(events);

    expect(postMessage).toHaveBeenCalledTimes(2);
  });

  it('does not use browser-only APIs while rendered on the server', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DOCUMENT,
          useValue: {
            baseURI: 'https://eventos.example/app/',
          },
        },
        {
          provide: PLATFORM_ID,
          useValue: 'server',
        },
      ],
    });
    const postMessage = installServiceWorkerMock(() => {
      throw new Error('Service worker should not be used during SSR.');
    });
    const service = TestBed.inject(AttendanceScannerCacheService);

    await service.cacheAttendanceCollection([eventFixture('evento-ssr')]);

    expect(postMessage).not.toHaveBeenCalled();
    expect(prepareZXingModule).not.toHaveBeenCalled();
  });
});
