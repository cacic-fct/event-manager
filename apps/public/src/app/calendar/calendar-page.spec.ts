import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { CalendarPreferencesStorageService } from '@cacic-fct/offline-public-data-access';
import { PublicFeatureFlagService } from '../feature-flags/public-feature-flag.service';
import { of } from 'rxjs';
import { Calendar } from './calendar-page';

describe('Calendar', () => {
  let component: Calendar;
  let fixture: ComponentFixture<Calendar>;
  let calendarPreferences: { watchDefaultItemView: ReturnType<typeof vi.fn> };
  let featureFlags: { stringValue: ReturnType<typeof vi.fn> };
  let calendarDefaultView = signal('list');

  beforeEach(async () => {
    calendarPreferences = {
      watchDefaultItemView: vi.fn().mockReturnValue(of('automatic')),
    };
    calendarDefaultView = signal('list');
    featureFlags = {
      stringValue: vi.fn(() => calendarDefaultView()),
    };

    await TestBed.configureTestingModule({
      imports: [Calendar],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        { provide: CalendarPreferencesStorageService, useValue: calendarPreferences },
        { provide: PublicFeatureFlagService, useValue: featureFlags },
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

    expect(component.filterModel()).toEqual({
      query: 'Angular',
      eventType: 'MINICURSO',
    });
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
});
