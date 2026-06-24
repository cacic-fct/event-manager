import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from '@cacic-fct/shared-angular';
import { CacicAccountPrivacyService } from '@cacic-fct/account-manager-privacy';
import { of } from 'rxjs';
import { App } from './app';
import { CookieBannerSyncService } from './privacy/cookie-banner-sync.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: signal(false),
            user: signal(null),
          },
        },
        {
          provide: CacicAccountPrivacyService,
          useValue: {
            refresh: () => of(undefined),
          },
        },
        {
          provide: CookieBannerSyncService,
          useValue: {
            acceptCookieBanner: () => of(true),
          },
        },
      ],
    }).compileComponents();
  });

  it('should create', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
