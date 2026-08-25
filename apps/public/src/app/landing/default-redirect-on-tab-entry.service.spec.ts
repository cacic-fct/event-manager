import { Location } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { Subject, firstValueFrom } from 'rxjs';
import { INTERRUPTION_PRIORITY_ORDERS } from '../interruption/interruption-flow';
import { DefaultRedirectOnTabEntryService } from './default-redirect-on-tab-entry.service';
import { DefaultRedirectService } from './default-redirect.service';

describe('DefaultRedirectOnTabEntryService', () => {
  let events: Subject<unknown>;
  let resolve: ReturnType<typeof vi.fn>;
  let replaceState: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    events = new Subject<unknown>();
    resolve = vi.fn().mockResolvedValue('/menu');
    replaceState = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        DefaultRedirectOnTabEntryService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: AuthService, useValue: { isAuthenticated: () => true } },
        { provide: DefaultRedirectService, useValue: { resolve } },
        { provide: Location, useValue: { replaceState } },
        { provide: Router, useValue: { events: events.asObservable() } },
      ],
    });
  });

  it('resolves only the first direct entry to a tab route', async () => {
    const service = TestBed.inject(DefaultRedirectOnTabEntryService);
    service.start();

    events.next(new NavigationEnd(1, '/calendar', '/calendar'));
    const candidate = await firstValueFrom(service.resolve({ currentUrl: '/calendar' }));
    events.next(new NavigationEnd(2, '/major-event', '/major-event'));

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(candidate?.target.toString()).toBe('/menu');
    expect(candidate?.priorityOrder).toBe(INTERRUPTION_PRIORITY_ORDERS.DEFAULT_REDIRECT);
  });

  it('does not run for an initial route outside the tabs', () => {
    const service = TestBed.inject(DefaultRedirectOnTabEntryService);
    service.start();

    events.next(new NavigationEnd(1, '/event/event-1', '/event/event-1'));

    expect(resolve).not.toHaveBeenCalled();
  });

  it('does not consume noredirect outside the tab routes', () => {
    const service = TestBed.inject(DefaultRedirectOnTabEntryService);
    service.start();

    events.next(new NavigationEnd(1, '/event/event-1?noredirect=1', '/event/event-1?noredirect=1'));

    expect(resolve).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('does not navigate when the initial tab is already the resolved route', async () => {
    resolve.mockResolvedValue('/calendar');
    const service = TestBed.inject(DefaultRedirectOnTabEntryService);
    service.start();

    events.next(new NavigationEnd(1, '/calendar?from=link', '/calendar?from=link'));
    await expect(firstValueFrom(service.resolve({ currentUrl: '/calendar?from=link' }))).resolves.toBeNull();

    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('consumes noredirect without resolving a default route', async () => {
    const service = TestBed.inject(DefaultRedirectOnTabEntryService);
    service.start();

    events.next(
      new NavigationEnd(1, '/calendar?noredirect=1&view=agenda#today', '/calendar?noredirect=1&view=agenda#today'),
    );

    expect(resolve).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledWith('/calendar?view=agenda#today');
  });
});
