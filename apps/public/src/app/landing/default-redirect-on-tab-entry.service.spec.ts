import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { Subject } from 'rxjs';
import { DefaultRedirectOnTabEntryService } from './default-redirect-on-tab-entry.service';
import { DefaultRedirectService } from './default-redirect.service';

describe('DefaultRedirectOnTabEntryService', () => {
  let events: Subject<unknown>;
  let resolve: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.fn>;
  let navigateToDefault: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    events = new Subject<unknown>();
    resolve = vi.fn().mockResolvedValue('/menu');
    navigateByUrl = vi.fn().mockResolvedValue(true);
    navigateToDefault = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        DefaultRedirectOnTabEntryService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: AuthService, useValue: { isAuthenticated: () => true } },
        { provide: DefaultRedirectService, useValue: { resolve, navigateToDefault } },
        { provide: Router, useValue: { events: events.asObservable(), navigateByUrl } },
      ],
    });
  });

  it('resolves only the first direct entry to a tab route', async () => {
    const service = TestBed.inject(DefaultRedirectOnTabEntryService);
    service.start();

    events.next(new NavigationEnd(1, '/calendar', '/calendar'));
    await Promise.resolve();
    await Promise.resolve();
    events.next(new NavigationEnd(2, '/major-event', '/major-event'));

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(navigateToDefault).toHaveBeenCalledWith(TestBed.inject(Router), '/menu');
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('does not run for an initial route outside the tabs', () => {
    const service = TestBed.inject(DefaultRedirectOnTabEntryService);
    service.start();

    events.next(new NavigationEnd(1, '/event/event-1', '/event/event-1'));

    expect(resolve).not.toHaveBeenCalled();
  });

  it('does not navigate when the initial tab is already the resolved route', async () => {
    resolve.mockResolvedValue('/calendar');
    const service = TestBed.inject(DefaultRedirectOnTabEntryService);
    service.start();

    events.next(new NavigationEnd(1, '/calendar?from=link', '/calendar?from=link'));
    await Promise.resolve();
    await Promise.resolve();

    expect(navigateToDefault).not.toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });
});
