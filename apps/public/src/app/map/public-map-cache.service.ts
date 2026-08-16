import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const CACHE_PREFIX = 'cacic-eventos:public-map:v1:';

@Injectable({ providedIn: 'root' })
export class PublicMapCacheService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  read<T>(key: string): T | null {
    if (!this.isBrowser) {
      return null;
    }

    try {
      const serialized = sessionStorage.getItem(CACHE_PREFIX + key);
      if (!serialized) {
        return null;
      }

      const entry = JSON.parse(serialized) as CacheEntry<T>;
      if (!Number.isFinite(entry.expiresAt) || entry.expiresAt <= Date.now()) {
        sessionStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }

      return entry.value;
    } catch {
      return null;
    }
  }

  write<T>(key: string, value: T, ttlMs: number): void {
    if (!this.isBrowser) {
      return;
    }

    try {
      sessionStorage.setItem(
        CACHE_PREFIX + key,
        JSON.stringify({
          expiresAt: Date.now() + ttlMs,
          value,
        } satisfies CacheEntry<T>),
      );
    } catch {
      // Storage can be unavailable in private browsing or under quota pressure.
    }
  }

  invalidate(): void {
    if (!this.isBrowser) {
      return;
    }

    try {
      for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
        const key = sessionStorage.key(index);
        if (key?.startsWith(CACHE_PREFIX)) {
          sessionStorage.removeItem(key);
        }
      }
    } catch {
      // The map remains usable without browser storage.
    }
  }
}
