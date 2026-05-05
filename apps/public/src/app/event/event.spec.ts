import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Event } from './event';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { signal } from '@angular/core';
import { AuthService } from '@cacic-eventos/shared-angular';
import { of } from 'rxjs';
import { EventApiService } from './event-api.service';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

describe('Event', () => {
  let component: Event;
  let fixture: ComponentFixture<Event>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Event],
      providers: [
        provideNoopAnimations(),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ eventId: 'event-1' })),
            queryParamMap: of(convertToParamMap({})),
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
                  slots: null,
                  availableSlots: null,
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
    }).compileComponents();

    fixture = TestBed.createComponent(Event);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
