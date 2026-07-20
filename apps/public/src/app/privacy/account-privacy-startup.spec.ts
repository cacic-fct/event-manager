import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { CacicAccountPrivacyService } from '@cacic-fct/account-manager-privacy';
import { AuthService, initializeCacicAccountPrivacyBestEffort } from '@cacic-fct/shared-angular';

describe('initializeCacicAccountPrivacyBestEffort', () => {
  const initialize = vi.fn<() => Promise<unknown>>();
  const initialized = signal(false);
  const isAuthenticated = signal(false);

  beforeEach(() => {
    initialize.mockReset();
    initialized.set(false);
    isAuthenticated.set(false);

    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            initialized,
            isAuthenticated,
          },
        },
        {
          provide: CacicAccountPrivacyService,
          useValue: {
            initialize,
          },
        },
      ],
    });
  });

  it('does not make app startup wait for privacy settings after authentication resolves', async () => {
    let resolveInitialize: (value: unknown) => void = () => undefined;
    const initializePromise = new Promise<unknown>((resolve) => {
      resolveInitialize = resolve;
    });
    initialize.mockReturnValue(initializePromise);

    const result = TestBed.runInInjectionContext(() => initializeCacicAccountPrivacyBestEffort());

    expect(result).toBeUndefined();
    expect(initialize).not.toHaveBeenCalled();

    initialized.set(true);
    isAuthenticated.set(true);
    TestBed.tick();

    expect(initialize).toHaveBeenCalledOnce();

    resolveInitialize(null);
    await initializePromise;
  });

  it('ignores privacy initialization failures', async () => {
    initialize.mockRejectedValue(new Error('privacy unavailable'));

    expect(() => TestBed.runInInjectionContext(() => initializeCacicAccountPrivacyBestEffort())).not.toThrow();
    initialized.set(true);
    isAuthenticated.set(true);
    TestBed.tick();
    await Promise.resolve();
  });

  it('ignores synchronous privacy initialization failures', () => {
    initialize.mockImplementation(() => {
      throw new Error('privacy unavailable');
    });

    expect(() => TestBed.runInInjectionContext(() => initializeCacicAccountPrivacyBestEffort())).not.toThrow();
    initialized.set(true);
    isAuthenticated.set(true);
    TestBed.tick();
  });

  it('does not fetch privacy settings for guests', () => {
    TestBed.runInInjectionContext(() => initializeCacicAccountPrivacyBestEffort());
    initialized.set(true);
    TestBed.tick();

    expect(initialize).not.toHaveBeenCalled();
  });
});
