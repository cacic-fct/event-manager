import { ComponentFixture, TestBed } from '@angular/core/testing';
import { registerLocaleData } from '@angular/common';
import localePtBr from '@angular/common/locales/pt';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { CalendarPreferencesStorageService, PublicDataAccessService } from '@cacic-fct/public-indexed-db';
import { AuthService } from '@cacic-fct/shared-angular';
import { createPublicEvent, publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import { PublicFeatureFlagService } from '../feature-flags/public-feature-flag.service';
import { EMPTY, Subject, of } from 'rxjs';
import { CalendarApiService } from './calendar-api.service';
import { Calendar } from './calendar-page';
import { RealtimeInvalidationService } from '../shared/realtime-invalidation.service';
import { NetworkStatusService } from '../shared/network-status.service';

registerLocaleData(localePtBr);

describe('Calendar', () => {
  let component: Calendar;
  let fixture: ComponentFixture<Calendar>;
  let calendarPreferences: { watchDefaultItemView: ReturnType<typeof vi.fn> };
  let calendarApi: {
    getCalendarEvents: ReturnType<typeof vi.fn>;
    getCurrentUserSubscribedEventIds: ReturnType<typeof vi.fn>;
  };
  let isAuthenticated = signal(true);
  let featureFlags: { stringValue: ReturnType<typeof vi.fn> };
  let calendarDefaultView = signal('list');
  let catalogEvents: Subject<void>;
  let currentUserEvents: Subject<void>;
  let liveEvents: PublicEvent[];
  let subscribedEventIds: Set<string>;

  beforeEach(async () => {
    calendarPreferences = {
      watchDefaultItemView: vi.fn().mockReturnValue(of('automatic')),
    };
    isAuthenticated = signal(true);
    calendarDefaultView = signal('list');
    featureFlags = {
      stringValue: vi.fn(() => calendarDefaultView()),
    };
    calendarApi = {
      getCalendarEvents: vi.fn(() => of(liveEvents)),
      getCurrentUserSubscribedEventIds: vi.fn(() => of(subscribedEventIds)),
    };
    catalogEvents = new Subject<void>();
    currentUserEvents = new Subject<void>();
    liveEvents = [calendarEvent('event-1', 'Evento inicial')];
    subscribedEventIds = new Set(['event-1']);

    await TestBed.configureTestingModule({
      imports: [Calendar],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        { provide: CalendarPreferencesStorageService, useValue: calendarPreferences },
        { provide: PublicFeatureFlagService, useValue: featureFlags },
        { provide: AuthService, useValue: { isAuthenticated } },
        { provide: CalendarApiService, useValue: calendarApi },
        {
          provide: NetworkStatusService,
          useValue: { isOnline: signal(true), watchStatusChanges: () => EMPTY },
        },
        {
          provide: PublicDataAccessService,
          useValue: {
            getCalendarEvents: vi.fn(() => Promise.resolve([])),
            getLastRefresh: vi.fn(() => Promise.resolve(null)),
            upsertCalendarEvents: vi.fn(() => Promise.resolve()),
          },
        },
        {
          provide: RealtimeInvalidationService,
          useValue: {
            watchCatalog: vi.fn(() => catalogEvents),
            watchCurrentUserData: vi.fn(() => currentUserEvents),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Calendar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('keeps calendar filters in the signal form model', () => {
    component.filterForm.query().value.set('Angular');
    component.filterForm.eventType().value.set('MINICURSO');
    component.filterForm.subscription().value.set('SUBSCRIBED');

    expect(component.filterModel()).toEqual({
      query: 'Angular',
      eventType: 'MINICURSO',
      subscription: 'SUBSCRIBED',
    });
  });

  it('keeps the optional filters hidden until the filter control is used', () => {
    fixture.detectChanges();

    expect(component.filtersOpen()).toBe(false);
    expect(fixture.nativeElement.querySelector('#calendar-filter-panel')).toBeNull();
    expect(fixture.nativeElement.querySelector('.filters-button')?.getAttribute('aria-expanded')).toBe('false');

    component.toggleFilters();
    fixture.detectChanges();

    expect(component.filtersOpen()).toBe(true);
    expect(fixture.nativeElement.querySelector('#calendar-filter-panel')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.filters-button')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('uses the stored default item view as the initial calendar view', async () => {
    calendarPreferences.watchDefaultItemView.mockReturnValueOnce(of('week'));
    fixture = TestBed.createComponent(Calendar);
    component = fixture.componentInstance;
    await fixture.whenStable();

    expect(component.viewMode()).toBe('week');
  });

  it('uses the feature-flagged default view when the preference is automatic', async () => {
    featureFlags.stringValue.mockReturnValue('week');
    fixture = TestBed.createComponent(Calendar);
    component = fixture.componentInstance;
    await fixture.whenStable();

    expect(component.viewMode()).toBe('week');
    expect(featureFlags.stringValue).toHaveBeenCalledWith('calendarDefaultView');
  });

  it('falls back to the list view when the feature flag has an unsupported value', () => {
    featureFlags.stringValue.mockReturnValue('month');
    fixture = TestBed.createComponent(Calendar);
    component = fixture.componentInstance;

    expect(component.viewMode()).toBe('list');
  });

  it('updates the automatic view when the feature flag becomes available', async () => {
    calendarDefaultView.set('week');
    await fixture.whenStable();

    expect(component.viewMode()).toBe('week');
  });

  it('keeps manual calendar view switches local to the page', () => {
    component.setViewMode('week');
    component.setViewMode('list');

    expect(component.viewMode()).toBe('list');
    expect(calendarPreferences.watchDefaultItemView).toHaveBeenCalled();
    expect('setDefaultItemView' in calendarPreferences).toBe(false);
  });

  it('reloads visible catalog data and personal subscriptions from their live invalidations', async () => {
    await vi.waitFor(() =>
      expect(component.calendarState()).toEqual(
        expect.objectContaining({ status: 'ready', events: [expect.objectContaining({ id: 'event-1' })] }),
      ),
    );

    liveEvents = [calendarEvent('event-2', 'Evento atualizado')];
    catalogEvents.next();
    await vi.waitFor(() =>
      expect(component.calendarState()).toEqual(
        expect.objectContaining({ status: 'ready', events: [expect.objectContaining({ id: 'event-2' })] }),
      ),
    );

    subscribedEventIds = new Set(['event-2']);
    currentUserEvents.next();
    await vi.waitFor(() =>
      expect(component.calendarState()).toEqual(
        expect.objectContaining({ status: 'ready', subscribedEventIds: new Set(['event-2']) }),
      ),
    );
  });
});

function calendarEvent(id: string, name: string): PublicEvent {
  return createPublicEvent({
    id,
    name,
    startDate: publicFixtureDateFromNow(1, 12),
    endDate: publicFixtureDateFromNow(1, 14),
  });
}
