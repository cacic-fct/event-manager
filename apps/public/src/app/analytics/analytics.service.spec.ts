import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { UmamiService } from '@cacic-fct/ngx-umami';
import { AuthService, provideCacicObservability } from '@cacic-fct/shared-angular';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: AuthService,
          useValue: {
            user: signal(null),
          },
        },
        provideCacicObservability({
          analytics: {
            websiteId: '',
            domains: [],
            isEnabled: () => true,
          },
          glitchtip: {
            dsn: '',
            project: 'public',
            isEnabled: () => false,
          },
        }),
        {
          provide: UmamiService,
          useValue: {
            isAvailable: () => true,
            trackEvent: () => {
              throw new Error('Umami is unavailable.');
            },
          },
        },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('does not propagate optional Umami tracking failures', () => {
    const service = TestBed.inject(AnalyticsService);

    expect(() => service.trackEvent('wallet_viewed')).not.toThrow();
  });
});
