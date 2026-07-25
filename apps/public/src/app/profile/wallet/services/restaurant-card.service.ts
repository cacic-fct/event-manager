import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { OfflinePublicDataAccessService } from '@cacic-fct/offline-public-data-access';

@Injectable({ providedIn: 'root' })
export class RestaurantCardService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly offlineData = inject(OfflinePublicDataAccessService);
  private readonly numbers = signal<Record<string, string>>({});
  private loadRequest = 0;

  async load(userId: string): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    const request = ++this.loadRequest;
    const storedCard = await this.offlineData.getRestaurantCard(userId);
    if (request !== this.loadRequest) return;

    this.numbers.update((numbers) => ({ ...numbers, [userId]: storedCard?.cardNumber ?? '' }));
  }

  get(userId: string): string | null {
    return this.numbers()[userId] || null;
  }

  async save(userId: string, number: string): Promise<void> {
    const value = this.sanitize(number);
    if (!value || !isPlatformBrowser(this.platformId)) return;

    await this.offlineData.replaceRestaurantCard({ userId, cardNumber: value, updatedAt: Date.now() });
    this.numbers.update((numbers) => ({ ...numbers, [userId]: value }));
  }

  private sanitize(value: string): string {
    return value.replace(/\D/g, '');
  }
}
