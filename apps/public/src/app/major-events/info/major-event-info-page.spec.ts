import { publicLocalDateKey } from '../../shared/public-local-date';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { AuthService } from '@cacic-fct/shared-angular';
import { RouteErrorService } from '@cacic-fct/shared-angular/errors/routing';
import { createPublicEvent, createPublicMajorEvent } from '@cacic-fct/event-manager-public-testing';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { MajorEventSubscriptionApiService } from '../registration/subscription-api.service';
import { MajorEventInfoApiService } from './major-event-info-api.service';
import { MajorEventInfoPage } from './major-event-info-page';
import { EventInformationFallbackService } from '../../shared/event-information-fallback.service';
import { MoreInfo } from '../../profile/attendance/more-info/more-info';
import { ParticipationWorkspaceStub } from '../../testing/participation-workspace.stub';

const majorEvent = createPublicMajorEvent({ hasEvents: true, regularSubscriptionOpen: true });

describe('MajorEventInfoPage', () => {
  const params = new BehaviorSubject(convertToParamMap({ majorEventId: majorEvent.id }));
  const queryParams = new BehaviorSubject(convertToParamMap({}));
  const authenticated = signal(false);
  const login = vi.fn();
  const navigate = vi.fn();
  const getMajorEvent = vi.fn(() => of(majorEvent));
  const fallback = vi.fn<EventInformationFallbackService['majorEvent']>();
  const getProgram = vi.fn(() => of([createPublicEvent()]));
  const getCurrentUserSubscription = vi.fn<MajorEventSubscriptionApiService['getCurrentUserSubscription']>(() =>
    of(null),
  );

  beforeEach(() => {
    vi.clearAllMocks();
    authenticated.set(false);
    queryParams.next(convertToParamMap({}));
    params.next(convertToParamMap({ majorEventId: majorEvent.id }));
    getMajorEvent.mockReturnValue(of(majorEvent));
    getProgram.mockReturnValue(of([createPublicEvent()]));
    getCurrentUserSubscription.mockReturnValue(of(null));
    TestBed.overrideComponent(MajorEventInfoPage, {
      remove: { imports: [MoreInfo] },
      add: { imports: [ParticipationWorkspaceStub] },
    });
    TestBed.configureTestingModule({
      imports: [MajorEventInfoPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: ActivatedRoute, useValue: { paramMap: params, queryParamMap: queryParams } },
        { provide: AuthService, useValue: { isAuthenticated: authenticated, login } },
        { provide: RouteErrorService, useValue: { navigate } },
        { provide: EventInformationFallbackService, useValue: { majorEvent: fallback } },
        { provide: MajorEventInfoApiService, useValue: { getMajorEvent, getProgram } },
        { provide: MajorEventSubscriptionApiService, useValue: { getCurrentUserSubscription } },
      ],
    });
  });

  it('lets guests read the overview and program without requesting private subscription data', () => {
    const fixture = TestBed.createComponent(MajorEventInfoPage);
    fixture.detectChanges();
    expect(fixture.componentInstance.majorEvent()).toEqual(majorEvent);
    expect(fixture.componentInstance.events()).toHaveLength(1);
    expect(getProgram).toHaveBeenCalledWith(majorEvent.id, undefined);
    expect(getCurrentUserSubscription).not.toHaveBeenCalled();
    fixture.componentInstance.login();
    expect(login).toHaveBeenCalledWith({ returnTo: `/major-event/${majorEvent.id}` });
  });

  it('keeps overview and already loaded activities when a later program page fails, and retries the same cursor', () => {
    const rows = Array.from({ length: 100 }, (_, index) => createPublicEvent({ id: `activity-${index}` }));
    getProgram
      .mockReturnValueOnce(of(rows))
      .mockReturnValueOnce(throwError(() => new Error('offline')))
      .mockReturnValueOnce(of([]));
    const fixture = TestBed.createComponent(MajorEventInfoPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    expect(page.programHasMore()).toBe(true);
    page.loadProgram();
    expect(page.programError()).toBe(true);
    expect(page.majorEvent()).toEqual(majorEvent);
    expect(page.events()).toHaveLength(100);
    page.loadProgram();
    expect(getProgram).toHaveBeenLastCalledWith(majorEvent.id, {
      id: rows[99].id,
      startDate: rows[99].startDate,
    });
    expect(page.programError()).toBe(false);
    expect(page.programHasMore()).toBe(false);
  });

  it('restores program pages and the selected day from the return URL', () => {
    const first = createPublicEvent();
    const nextDate = new Date(Date.parse(first.startDate) + 86_400_000);
    const next = createPublicEvent({ startDate: nextDate.toISOString() });
    const day = publicLocalDateKey(nextDate);
    const pages = 21;
    queryParams.next(convertToParamMap({ programPages: String(pages), programDay: day }));
    for (let page = 0; page < pages - 1; page++) {
      const rows = Array.from({ length: 100 }, (_, index) => ({ ...first, id: `activity-${page}-${index}` }));
      getProgram.mockReturnValueOnce(of(rows));
    }
    getProgram.mockReturnValueOnce(of([next]));

    const fixture = TestBed.createComponent(MajorEventInfoPage);
    fixture.detectChanges();

    expect(getProgram).toHaveBeenCalledTimes(pages);
    expect(fixture.componentInstance.events()).toHaveLength(2001);
    const link = (fixture.nativeElement as HTMLElement).querySelector('.program a');
    const url = new URL(link?.getAttribute('href') ?? '', 'https://example.test');
    expect(url.searchParams.get('returnUrl')).toBe(
      `/major-event/${majorEvent.id}?programDay=${day}&programPages=${pages}`,
    );
    expect(link?.textContent).toContain(next.name);
  });

  it('discards a pending program when navigating to another major event', () => {
    const pending = new Subject<ReturnType<typeof createPublicEvent>[]>();
    const nextEvent = createPublicMajorEvent({ id: 'next-major-event' });
    const activity = createPublicEvent({ majorEventId: nextEvent.id });
    getMajorEvent.mockReturnValueOnce(of(majorEvent)).mockReturnValueOnce(of(nextEvent));
    getProgram.mockReturnValueOnce(pending).mockReturnValueOnce(of([activity]));
    const fixture = TestBed.createComponent(MajorEventInfoPage);
    fixture.detectChanges();

    params.next(convertToParamMap({ majorEventId: nextEvent.id }));
    pending.next([createPublicEvent({ majorEventId: majorEvent.id })]);

    expect(getProgram).toHaveBeenLastCalledWith(nextEvent.id, undefined);
    expect(fixture.componentInstance.events()).toEqual([activity]);
    expect(fixture.componentInstance.programLoading()).toBe(false);
  });

  it('shows fallback program activities when the subscription has no selected events', () => {
    const activity = createPublicEvent({ majorEventId: majorEvent.id });
    getMajorEvent.mockReturnValueOnce(throwError(() => new Error('unavailable')));
    getProgram.mockReturnValueOnce(throwError(() => new Error('unavailable')));
    fallback.mockReturnValueOnce(
      of({
        event: majorEvent,
        details: {
          majorEvent,
          events: [activity],
          attendances: [],
          subscription: {
            id: 'subscription',
            majorEventId: majorEvent.id,
            majorEvent,
            subscriptionStatus: 'CONFIRMED',
            selectedEvents: [],
          },
        },
      }),
    );
    const fixture = TestBed.createComponent(MajorEventInfoPage);
    fixture.detectChanges();

    expect(fixture.componentInstance.events()).toEqual([activity]);
  });

  it.each([
    ['CONFIRMED', true],
    ['WAITING_RECEIPT_UPLOAD', true],
    ['RECEIPT_UNDER_REVIEW', true],
    ['REJECTED_INVALID_RECEIPT', true],
    ['CANCELED', false],
  ])('uses the actual subscription status %s for subscription-tab visibility', async (status, visible) => {
    authenticated.set(true);
    getCurrentUserSubscription.mockReturnValue(
      of({
        id: 'subscription',
        majorEventId: majorEvent.id,
        majorEvent,
        subscriptionStatus: status as string,
        selectedEvents: [],
        notSubscribedEvents: [],
      }),
    );
    const fixture = TestBed.createComponent(MajorEventInfoPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.hasSubscription()).toBe(visible);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('mat-tab-group')).toHaveLength(visible ? 1 : 0);
  });

  it('shows one general view to a signed-in person without a subscription', async () => {
    authenticated.set(true);
    const fixture = TestBed.createComponent(MajorEventInfoPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.hasSubscription()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('mat-tab-group')).toBeNull();
  });

  it('loads subscription state when authentication arrives after the public page', () => {
    const fixture = TestBed.createComponent(MajorEventInfoPage);
    fixture.detectChanges();
    authenticated.set(true);
    fixture.detectChanges();
    expect(getCurrentUserSubscription).toHaveBeenCalledWith(majorEvent.id);
  });
});
