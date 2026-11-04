import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PublicDataAccessService } from '@cacic-fct/public-indexed-db';
import { AuthService } from '@cacic-fct/shared-angular/auth';
import { NetworkStatusService } from './network-status.service';
import { OfflineUserDataService } from './offline-user-data.service';

it('preserves saved participation on an offline restart and clears it for a confirmed online guest', async () => {
  const isOnline = signal(false);
  const initialized = signal(false);
  const purgeUserData = vi.fn().mockResolvedValue(undefined);
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { user: () => null, initialized } },
      { provide: PublicDataAccessService, useValue: { purgeUserData } },
      { provide: NetworkStatusService, useValue: { isOnline } },
    ],
  });
  TestBed.runInInjectionContext(() => TestBed.inject(OfflineUserDataService).start());
  TestBed.tick();
  await Promise.resolve();
  expect(purgeUserData).not.toHaveBeenCalled();

  initialized.set(true);
  TestBed.tick();
  await Promise.resolve();
  expect(purgeUserData).not.toHaveBeenCalled();

  isOnline.set(true);
  TestBed.tick();
  await Promise.resolve();
  expect(purgeUserData).toHaveBeenCalledOnce();
});
