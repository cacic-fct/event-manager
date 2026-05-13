import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Attendances } from './attendances';

describe('Attendances', () => {
  let component: Attendances;
  let fixture: ComponentFixture<Attendances>;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Attendances],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Attendances);
    component = fixture.componentInstance;
    fixture.detectChanges();
    httpTesting.expectOne('/api/graphql').flush({
      data: {
        currentUserMajorEventFeed: [],
        currentUserSubscriptionFeed: {
          items: [],
        },
        currentUserEventAttendances: [],
      },
    });
    await fixture.whenStable();
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should sort subscriptions feed dates in descending order', async () => {
    fixture = TestBed.createComponent(Attendances);
    component = fixture.componentInstance;
    fixture.detectChanges();

    httpTesting.expectOne('/api/graphql').flush({
      data: {
        currentUserMajorEventFeed: [
          {
            id: 'major-event-old',
            majorEventId: 'major-event-old',
            majorEvent: {
              id: 'major-event-old',
              name: 'Major Event Old',
              emoji: '📅',
              startDate: '2026-01-10T10:00:00.000Z',
              endDate: '2026-01-10T12:00:00.000Z',
            },
            participation: {
              isSubscribed: true,
              isLecturer: false,
              hasIssuedCertificate: false,
            },
          },
          {
            id: 'major-event-new',
            majorEventId: 'major-event-new',
            majorEvent: {
              id: 'major-event-new',
              name: 'Major Event New',
              emoji: '🚀',
              startDate: '2026-02-10T10:00:00.000Z',
              endDate: '2026-02-10T12:00:00.000Z',
            },
            participation: {
              isSubscribed: true,
              isLecturer: false,
              hasIssuedCertificate: false,
            },
          },
        ],
        currentUserSubscriptionFeed: {
          items: [
            {
              type: 'SINGLE_EVENT',
              subscriptionId: null,
              eventId: 'event-old',
              date: '2026-01-05T10:00:00.000Z',
              createdAt: '2026-01-01T10:00:00.000Z',
              event: {
                id: 'event-old',
                name: 'Event Old',
                startDate: '2026-01-05T10:00:00.000Z',
                endDate: '2026-01-05T11:00:00.000Z',
                emoji: '📘',
                type: 'PALESTRA',
                description: null,
                shortDescription: null,
                locationDescription: null,
              },
              eventGroup: null,
              eventGroupId: null,
              participation: {
                isSubscribed: true,
                isLecturer: false,
                hasIssuedCertificate: false,
              },
            },
            {
              type: 'SINGLE_EVENT',
              subscriptionId: null,
              eventId: 'event-new',
              date: '2026-03-05T10:00:00.000Z',
              createdAt: '2026-01-01T10:00:00.000Z',
              event: {
                id: 'event-new',
                name: 'Event New',
                startDate: '2026-03-05T10:00:00.000Z',
                endDate: '2026-03-05T11:00:00.000Z',
                emoji: '📗',
                type: 'MINICURSO',
                description: null,
                shortDescription: null,
                locationDescription: null,
              },
              eventGroup: null,
              eventGroupId: null,
              participation: {
                isSubscribed: true,
                isLecturer: false,
                hasIssuedCertificate: false,
              },
            },
          ],
        },
        currentUserEventAttendances: [],
      },
    });

    await fixture.whenStable();

    const state = component.feedState();
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') {
      throw new Error('Expected feed state to be ready');
    }

    expect(state.data.majorEventItems.map((item) => item.majorEvent.id)).toEqual(['major-event-new', 'major-event-old']);
    expect(state.data.eventItems.map((item) => item.startDate)).toEqual([
      '2026-03-05T10:00:00.000Z',
      '2026-01-05T10:00:00.000Z',
    ]);
  });
});
