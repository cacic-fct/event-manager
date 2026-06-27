import { TestBed } from '@angular/core/testing';
import { CacicAccountPrivacyService } from '@cacic-fct/account-manager-privacy';
import { initializeCacicAccountPrivacyBestEffort } from '@cacic-fct/shared-angular';

describe('initializeCacicAccountPrivacyBestEffort', () => {
  const initialize = vi.fn<() => Promise<unknown>>();

  beforeEach(() => {
    initialize.mockReset();

    TestBed.configureTestingModule({
      providers: [
        {
          provide: CacicAccountPrivacyService,
          useValue: {
            initialize,
          },
        },
      ],
    });
  });

  it('does not make app startup wait for privacy settings', async () => {
    let resolveInitialize: (value: unknown) => void = () => undefined;
    const initializePromise = new Promise<unknown>((resolve) => {
      resolveInitialize = resolve;
    });
    initialize.mockReturnValue(initializePromise);

    const result = TestBed.runInInjectionContext(() => initializeCacicAccountPrivacyBestEffort());

    expect(result).toBeUndefined();
    expect(initialize).toHaveBeenCalledOnce();

    resolveInitialize(null);
    await initializePromise;
  });

  it('ignores privacy initialization failures', async () => {
    initialize.mockRejectedValue(new Error('privacy unavailable'));

    expect(() => TestBed.runInInjectionContext(() => initializeCacicAccountPrivacyBestEffort())).not.toThrow();
    await Promise.resolve();
  });

  it('ignores synchronous privacy initialization failures', () => {
    initialize.mockImplementation(() => {
      throw new Error('privacy unavailable');
    });

    expect(() => TestBed.runInInjectionContext(() => initializeCacicAccountPrivacyBestEffort())).not.toThrow();
  });
});
