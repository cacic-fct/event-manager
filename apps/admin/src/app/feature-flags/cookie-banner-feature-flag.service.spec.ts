import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';

const unleashClientMock = vi.hoisted(() => ({
  start: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  on: vi.fn(),
  isEnabled: vi.fn(() => false),
  constructor: vi.fn(),
}));

vi.mock('unleash-proxy-client', () => ({
  UnleashClient: vi.fn(function UnleashClient(config: unknown) {
    unleashClientMock.constructor(config);
    return {
      start: unleashClientMock.start,
      on: unleashClientMock.on,
      isEnabled: unleashClientMock.isEnabled,
    };
  }),
}));

describe('CookieBannerFeatureFlagService', () => {
  let CookieBannerFeatureFlagService: typeof import('./cookie-banner-feature-flag.service').CookieBannerFeatureFlagService;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    vi.resetModules();
    vi.clearAllMocks();
    CookieBannerFeatureFlagService = (await import('./cookie-banner-feature-flag.service')).CookieBannerFeatureFlagService;

    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('does not block initialization when Unleash startup hangs', async () => {
    vi.stubGlobal('ngDevMode', false);
    vi.stubGlobal('document', {
      querySelector: () => null,
    });
    unleashClientMock.start.mockReturnValueOnce(new Promise(() => undefined));

    const service = TestBed.inject(CookieBannerFeatureFlagService);

    await expect(service.initialize()).resolves.toBeUndefined();
    expect(unleashClientMock.start).toHaveBeenCalledOnce();
    expect(service.enabled()).toBe(true);
  });
});
