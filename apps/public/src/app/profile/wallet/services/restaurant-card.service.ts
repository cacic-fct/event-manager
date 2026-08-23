import { isPlatformBrowser } from '@angular/common';
import { Service, PLATFORM_ID, inject, signal } from '@angular/core';
import { PublicDataAccessService } from '@cacic-fct/public-indexed-db';

@Service()
export class RestaurantCardService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly offlineData = inject(PublicDataAccessService);
  private readonly numbers = signal<Record<string, string>>({});
  private readonly versions = new Map<string, number>();

  async load(userId: string): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    const version = this.versions.get(userId) ?? 0;
    const storedCard = await this.offlineData.getRestaurantCard(userId);
    if (version !== (this.versions.get(userId) ?? 0)) return;

    this.numbers.update((numbers) => ({ ...numbers, [userId]: storedCard?.cardNumber ?? '' }));
  }

  get(userId: string): string | null {
    return this.numbers()[userId] || null;
  }

  async save(userId: string, number: string): Promise<void> {
    const value = this.sanitize(number);
    if (!value || !isPlatformBrowser(this.platformId)) return;

    this.versions.set(userId, (this.versions.get(userId) ?? 0) + 1);
    await this.offlineData.replaceRestaurantCard({ userId, cardNumber: value, updatedAt: Date.now() });
    this.numbers.update((numbers) => ({ ...numbers, [userId]: value }));
  }

  private sanitize(value: string): string {
    return value.replace(/\D/g, '');
  }
}
