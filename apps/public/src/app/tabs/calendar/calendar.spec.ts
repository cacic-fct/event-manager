import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { CalendarPreferencesStorageService } from '@cacic-fct/offline-public-data-access';
import { of } from 'rxjs';
import { Calendar } from './calendar';

describe('Calendar', () => {
  let component: Calendar;
  let fixture: ComponentFixture<Calendar>;
  let calendarPreferences: { watchDefaultItemView: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    calendarPreferences = {
      watchDefaultItemView: vi.fn().mockReturnValue(of('automatic')),
    };

    await TestBed.configureTestingModule({
      imports: [Calendar],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        { provide: CalendarPreferencesStorageService, useValue: calendarPreferences },
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

  it('keeps manual calendar view switches local to the page', () => {
    component.setViewMode('week');
    component.setViewMode('list');

    expect(component.viewMode()).toBe('list');
    expect(calendarPreferences.watchDefaultItemView).toHaveBeenCalled();
    expect('setDefaultItemView' in calendarPreferences).toBe(false);
  });
});
