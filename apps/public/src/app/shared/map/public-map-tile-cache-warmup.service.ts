import { isPlatformBrowser } from '@angular/common';
import { Service, PLATFORM_ID, inject } from '@angular/core';

const OPENSTREETMAP_TILE_ORIGIN = 'https://tile.openstreetmap.org';
const WEB_MERCATOR_MAX_LATITUDE = 85.05112878;
const WARMUP_ZOOMS = [16, 18] as const;
const WARMUP_OFFSETS = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

@Service()
export class PublicMapTileCacheWarmupService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly warmedUrls = new Set<string>();
  private readonly inFlightWarmups = new Map<string, Promise<boolean>>();

  async warmLocation(latitude: number, longitude: number): Promise<boolean> {
    if (!this.isBrowser || !this.validCoordinates(latitude, longitude) || navigator.onLine === false) {
      return false;
    }

    const urls = openStreetMapTileWarmupUrls(latitude, longitude).filter((url) => !this.warmedUrls.has(url));
    if (urls.length === 0) {
      return true;
    }

    const warmupKey = urls.join('|');
    const existingWarmup = this.inFlightWarmups.get(warmupKey);
    if (existingWarmup) {
      return existingWarmup;
    }

    const warmup = this.askServiceWorkerToCache(urls)
      .catch(() => false)
      .then((warmed) => {
        if (warmed) {
          urls.forEach((url) => this.warmedUrls.add(url));
        }
        return warmed;
      })
      .finally(() => {
        if (this.inFlightWarmups.get(warmupKey) === warmup) {
          this.inFlightWarmups.delete(warmupKey);
        }
      });
    this.inFlightWarmups.set(warmupKey, warmup);
    return warmup;
  }

  private async askServiceWorkerToCache(urls: readonly string[]): Promise<boolean> {
    if (!('serviceWorker' in navigator)) {
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    const worker = registration.active ?? navigator.serviceWorker.controller;
    if (!worker) {
      return false;
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
        resolve(event.data?.type === 'CACHE_MAP_TILES_RESULT' && event.data.ok === true);
      };

      try {
        worker.postMessage({ type: 'CACHE_MAP_TILES', urls }, [channel.port2]);
      } catch {
        clearTimeout(timeout);
        channel.port1.close();
        resolve(false);
      }
    });
  }

  private validCoordinates(latitude: number, longitude: number): boolean {
    return (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    );
  }
}

export function openStreetMapTileWarmupUrls(latitude: number, longitude: number): string[] {
  const clampedLatitude = Math.max(-WEB_MERCATOR_MAX_LATITUDE, Math.min(WEB_MERCATOR_MAX_LATITUDE, latitude));
  const latitudeRadians = (clampedLatitude * Math.PI) / 180;

  return WARMUP_ZOOMS.flatMap((zoom) => {
    const tileCount = 2 ** zoom;
    const centerX = Math.max(0, Math.min(tileCount - 1, Math.floor(((longitude + 180) / 360) * tileCount)));
    const centerY = Math.max(
      0,
      Math.min(tileCount - 1, Math.floor(((1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2) * tileCount)),
    );

    return WARMUP_OFFSETS.map(([xOffset, yOffset]) => {
      const x = Math.max(0, Math.min(tileCount - 1, centerX + xOffset));
      const y = Math.max(0, Math.min(tileCount - 1, centerY + yOffset));
      return `${OPENSTREETMAP_TILE_ORIGIN}/${zoom}/${x}/${y}.png`;
    });
  });
}
