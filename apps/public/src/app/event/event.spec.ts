import '../testing/observer-mocks';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Event } from './event';
import { ActivatedRoute, convertToParamMap, Router, Params } from '@angular/router';
import { signal } from '@angular/core';
import { AuthService } from '@cacic-fct/shared-angular';
import { of } from 'rxjs';
import { EventApiService } from './event-api.service';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

function createEventComponentFixture(queryParamMap: Params = {}): ComponentFixture<Event> {
  TestBed.configureTestingModule({
    imports: [Event],
    providers: [
      provideNoopAnimations(),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(convertToParamMap({ eventId: 'event-1' })),
          queryParamMap: of(convertToParamMap(queryParamMap)),
        },
      },
      {
        provide: AuthService,
        useValue: {
          isAuthenticated: signal(false),
          login: vi.fn(),
        },
      },
      {
        provide: EventApiService,
        useValue: {
          getEventPageData: () =>
            of({
              event: {
                id: 'event-1',
                name: 'Evento teste',
                startDate: '2026-05-03T10:00:00.000Z',
                endDate: '2026-05-03T11:00:00.000Z',
                emoji: '🎓',
                type: 'OTHER',
                allowSubscription: false,
              },
              subscriptionSummary: {
                eventId: 'event-1',
                hasAvailableSlots: true,
              },
              weather: null,
              currentUserSubscription: null,
              currentUserAttendance: null,
            }),
          subscribeToEvent: vi.fn(),
          confirmAttendance: vi.fn(),
        },
      },
      {
        provide: Router,
        useValue: {
          url: '/event/event-1',
          navigateByUrl: vi.fn(),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(Event);
  return fixture;
}

describe('Event', () => {
  let component: Event;
  let fixture: ComponentFixture<Event>;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    fixture = createEventComponentFixture({});
    await fixture.whenStable();
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should use back query parameter as return URL', async () => {
    const testBackUrl = '/validate?certificateId=123';
    const newFixture = createEventComponentFixture({ back: testBackUrl });
    await newFixture.whenStable();
    const newComponent = newFixture.componentInstance;

    expect(newComponent.backUrl()).toBe(testBackUrl);
  });

  it('should fall back to returnUrl if back parameter is not provided', async () => {
    const testReturnUrl = '/calendar';
    const newFixture = createEventComponentFixture({ returnUrl: testReturnUrl });
    await newFixture.whenStable();
    const newComponent = newFixture.componentInstance;

    expect(newComponent.backUrl()).toBe(testReturnUrl);
  });

  it('should prioritize back over returnUrl if both are provided', async () => {
    const testBackUrl = '/validate?certificateId=123';
    const testReturnUrl = '/calendar';
    const newFixture = createEventComponentFixture({ back: testBackUrl, returnUrl: testReturnUrl });
    await newFixture.whenStable();
    const newComponent = newFixture.componentInstance;

    expect(newComponent.backUrl()).toBe(testBackUrl);
  });

  it('should default to /menu if neither back nor returnUrl is provided', async () => {
    expect(component.backUrl()).toBe('/menu');
  });
});
