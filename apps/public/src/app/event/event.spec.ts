import '../testing/observer-mocks';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Event } from './event';
import { ActivatedRoute, convertToParamMap, Router, Params } from '@angular/router';
import { signal } from '@angular/core';
import { AuthService } from '@cacic-fct/shared-angular';
import { of } from 'rxjs';
import { EventApiService } from './event-api.service';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

async function createEventComponentFixture(queryParamMap: Params = {}): Promise<ComponentFixture<Event>> {
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
                lecturers: [
                  {
                    id: 'lecturer-profile-1',
                    displayName: 'Ada Lovelace',
                    biography: 'Pioneira em computação.',
                    publishGoogleUserPicture: false,
                    googleUserPicture: null,
                    email: 'ada@example.com',
                    whatsapp: '+5518999999999',
                  },
                ],
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
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(Event);
  return fixture;
}

describe('Event', () => {
  let component: Event;
  let fixture: ComponentFixture<Event>;
  beforeEach(async () => {
    fixture = await createEventComponentFixture({});
    await fixture.whenStable();
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should use back query parameter as return URL', async () => {
    const testBackUrl = '/validate?certificateId=123';
    TestBed.resetTestingModule();
    const newFixture = await createEventComponentFixture({ back: testBackUrl });
    await newFixture.whenStable();
    const newComponent = newFixture.componentInstance;

    expect(newComponent.backUrl()).toBe(testBackUrl);
  });

  it('should fall back to returnUrl if back parameter is not provided', async () => {
    const testReturnUrl = '/calendar';
    TestBed.resetTestingModule();
    const newFixture = await createEventComponentFixture({ returnUrl: testReturnUrl });
    await newFixture.whenStable();
    const newComponent = newFixture.componentInstance;

    expect(newComponent.backUrl()).toBe(testReturnUrl);
  });

  it('should prioritize back over returnUrl if both are provided', async () => {
    const testBackUrl = '/validate?certificateId=123';
    const testReturnUrl = '/calendar';
    TestBed.resetTestingModule();
    const newFixture = await createEventComponentFixture({ back: testBackUrl, returnUrl: testReturnUrl });
    await newFixture.whenStable();
    const newComponent = newFixture.componentInstance;

    expect(newComponent.backUrl()).toBe(testBackUrl);
  });

  it('should default to /menu if neither back nor returnUrl is provided', async () => {
    expect(component.backUrl()).toBe('/menu');
  });

  it('renders lecturer profiles with contact links', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Ada Lovelace');
    expect(compiled.textContent).toContain('Pioneira em computação.');
    expect(compiled.querySelector('a[href="mailto:ada@example.com"]')).toBeTruthy();
    expect(compiled.querySelector('a[href="https://wa.me/5518999999999"]')).toBeTruthy();
  });
});
