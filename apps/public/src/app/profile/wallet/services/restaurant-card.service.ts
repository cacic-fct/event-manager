import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

const STORAGE_PREFIX = 'cacic-eventos:wallet:restaurant-card:';

@Injectable({ providedIn: 'root' })
export class RestaurantCardService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly numbers = signal<Record<string, string>>({});

  load(userId: string): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const value = this.sanitize(window.localStorage.getItem(this.storageKey(userId)) ?? '');
    this.numbers.update((numbers) => ({ ...numbers, [userId]: value }));
  }

  get(userId: string): string | null {
    return this.numbers()[userId] || null;
  }

  save(userId: string, number: string): void {
    const value = this.sanitize(number);
    if (!value || !isPlatformBrowser(this.platformId)) return;

    window.localStorage.setItem(this.storageKey(userId), value);
    this.numbers.update((numbers) => ({ ...numbers, [userId]: value }));
  }

  private storageKey(userId: string): string {
    return `${STORAGE_PREFIX}${userId}`;
  }

  private sanitize(value: string): string {
    return value.replace(/\D/g, '');
  }
}
