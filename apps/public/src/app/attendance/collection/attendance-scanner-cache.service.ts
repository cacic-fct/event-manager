import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { prepareZXingModule, ZXING_WASM_VERSION } from 'zxing-wasm';
import { AttendanceCollectionEvent } from './attendance-collection-api.service';

@Injectable({ providedIn: 'root' })
export class AttendanceScannerCacheService {
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly warmedEventIds = new Set<string>();
  private wasmWarmup: Promise<unknown> | null = null;

  async cacheAttendanceCollection(events: readonly AttendanceCollectionEvent[]): Promise<void> {
    if (!this.isBrowser || events.length === 0) {
      return;
    }

    const newEventIds = events.map((event) => event.eventId).filter((eventId) => !this.warmedEventIds.has(eventId));
    if (newEventIds.length === 0) {
      return;
    }

    const [, serviceWorkerResult] = await Promise.allSettled([
      this.warmZXingWasm(),
      this.askServiceWorkerToCache(newEventIds),
    ]);
    if (serviceWorkerResult.status === 'fulfilled' && serviceWorkerResult.value) {
      newEventIds.forEach((eventId) => this.warmedEventIds.add(eventId));
    }
  }

  private warmZXingWasm(): Promise<unknown> {
    this.wasmWarmup ??= Promise.resolve(
      prepareZXingModule({
        fireImmediately: true,
      }),
    );

    return this.wasmWarmup;
  }

  private async askServiceWorkerToCache(eventIds: readonly string[]): Promise<boolean> {
    if (!('serviceWorker' in navigator)) {
      return true;
    }

    const registration = await navigator.serviceWorker.ready;
    const worker = registration.active ?? navigator.serviceWorker.controller;
    if (!worker) {
      return true;
    }

    return new Promise((resolve) => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => {
        channel.port1.close();
        resolve(false);
      }, 10_000);

      channel.port1.onmessage = (event) => {
        clearTimeout(timeout);
        channel.port1.close();
        resolve(event.data?.type === 'CACHE_ATTENDANCE_SCANNER_RESULT' && event.data.ok === true);
      };

      try {
        worker.postMessage(
          {
            type: 'CACHE_ATTENDANCE_SCANNER',
            urls: [
              this.appUrl('attendance/collect'),
              ...eventIds.map((eventId) => this.appUrl(`attendance/collect/${encodeURIComponent(eventId)}`)),
              ...this.zxingWasmUrls(),
            ],
          },
          [channel.port2],
        );
      } catch {
        clearTimeout(timeout);
        channel.port1.close();
        resolve(false);
      }
    });
  }

  private appUrl(path: string): string {
    return new URL(path, this.document.baseURI).toString();
  }

  private zxingWasmUrls(): string[] {
    return [
      `https://fastly.jsdelivr.net/npm/zxing-wasm@${ZXING_WASM_VERSION}/dist/full/zxing_full.wasm`,
      `https://cdn.jsdelivr.net/npm/zxing-wasm@${ZXING_WASM_VERSION}/dist/full/zxing_full.wasm`,
    ];
  }
}
