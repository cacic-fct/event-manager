import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '@cacic-fct/shared-angular';
import { Observable, of } from 'rxjs';
import { NetworkStatusService } from '../network-status.service';
import { TotpApiService } from './totp-api.service';
import { TotpSeedSessionService } from './totp-seed-session.service';
import { TotpSeedCacheService } from '@cacic-fct/public-indexed-db';

describe('TotpSeedSessionService', () => {
  it('does not write a stale seed after the account changes during fetch', async () => {
    let resolveSeed!: (value: unknown) => void;
    const auth = { user: vi.fn(() => ({ sub: 'user-a' })) };
    const replaceSeed = vi.fn().mockResolvedValue(undefined);
    const clearSeedsExcept = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        TotpSeedSessionService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: AuthService, useValue: auth },
        { provide: NetworkStatusService, useValue: { isOnline: () => true } },
        {
          provide: TotpApiService,
          useValue: {
            getSeed: vi.fn(
              () =>
                new Observable((subscriber) => {
                  resolveSeed = (value) => {
                    subscriber.next(value);
                    subscriber.complete();
                  };
                }),
            ),
          },
        },
        {
          provide: TotpSeedCacheService,
          useValue: {
            clearExpiredSeeds: vi.fn().mockResolvedValue(undefined),
            getSeed: vi.fn().mockResolvedValue(null),
            replaceSeed,
            clearSeedsExcept,
          },
        },
      ],
    });
    const service = TestBed.inject(TotpSeedSessionService);
    (service as unknown as { authGeneration: number }).authGeneration = 1;
    const request = service.getWalletSeed('user-a', 1);
    await Promise.resolve();
    await Promise.resolve();
    auth.user.mockReturnValue({ sub: 'user-b' });
    resolveSeed({ userId: 'user-a', primaryEmail: 'a@example.com', seed: 'seed', algorithm: 'SHA512', digits: 6, periodSeconds: 30, serverTime: new Date(), sessionExpiresAt: Date.now() + 10_000 });

    await expect(request).resolves.toBeNull();
    expect(replaceSeed).not.toHaveBeenCalled();
    expect(clearSeedsExcept).not.toHaveBeenCalled();
  });

  it('does not leak timer cleanup rejection', async () => {
    const clearExpiredSeeds = vi.fn().mockRejectedValue(new Error('IndexedDB closed'));
    TestBed.configureTestingModule({
      providers: [
        TotpSeedSessionService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: AuthService, useValue: { user: () => null } },
        { provide: NetworkStatusService, useValue: { isOnline: () => false } },
        { provide: TotpApiService, useValue: { getSeed: vi.fn(() => of(null)) } },
        { provide: TotpSeedCacheService, useValue: { clearExpiredSeeds, clearSeeds: vi.fn(), clearSeedsExcept: vi.fn() } },
      ],
    });
    const service = TestBed.inject(TotpSeedSessionService);
    service.start();
    expect(clearExpiredSeeds).not.toHaveBeenCalled();
  });
});
