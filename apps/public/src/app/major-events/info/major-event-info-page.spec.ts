import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { AuthService } from '@cacic-fct/shared-angular';
import { RouteErrorService } from '@cacic-fct/shared-angular/errors/routing';
import { createPublicEvent, createPublicMajorEvent } from '@cacic-fct/event-manager-public-testing';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { MajorEventSubscriptionApiService } from '../registration/subscription-api.service';
import { MajorEventInfoApiService } from './major-event-info-api.service';
import { MajorEventInfoPage } from './major-event-info-page';

const majorEvent = createPublicMajorEvent({ hasEvents: true, regularSubscriptionOpen: true });

describe('MajorEventInfoPage', () => {
  const params = new BehaviorSubject(convertToParamMap({ majorEventId: majorEvent.id }));
  const authenticated = signal(false);
  const login = vi.fn();
  const navigate = vi.fn();
  const getMajorEvent = vi.fn(() => of(majorEvent));
  const getProgram = vi.fn(() => of([createPublicEvent()]));
  const getCurrentUserSubscription = vi.fn(() => of(null));

  beforeEach(() => {
    vi.clearAllMocks();
    authenticated.set(false);
    params.next(convertToParamMap({ majorEventId: majorEvent.id }));
    getMajorEvent.mockReturnValue(of(majorEvent));
    getProgram.mockReturnValue(of([createPublicEvent()]));
    TestBed.configureTestingModule({
      imports: [MajorEventInfoPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: ActivatedRoute, useValue: { paramMap: params } },
        { provide: AuthService, useValue: { isAuthenticated: authenticated, login } },
        { provide: RouteErrorService, useValue: { navigate } },
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
    expect(getProgram).toHaveBeenCalledWith(majorEvent.id, 0);
    expect(getCurrentUserSubscription).not.toHaveBeenCalled();
    fixture.componentInstance.login();
    expect(login).toHaveBeenCalledWith({ returnTo: `/major-event/${majorEvent.id}` });
  });

  it('keeps overview and already loaded activities when a later program page fails, and retries the same offset', () => {
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
    expect(getProgram).toHaveBeenLastCalledWith(majorEvent.id, 100);
    expect(page.programError()).toBe(false);
    expect(page.programHasMore()).toBe(false);
  });

  it('loads subscription state when authentication arrives after the public page', () => {
    const fixture = TestBed.createComponent(MajorEventInfoPage);
    fixture.detectChanges();
    authenticated.set(true);
    fixture.detectChanges();
    expect(getCurrentUserSubscription).toHaveBeenCalledWith(majorEvent.id);
  });
});
