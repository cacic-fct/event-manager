import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import { InterestApiService, InterestTargetType } from './interest-api.service';

describe('InterestApiService', () => {
  let graphqlHttp: { request: ReturnType<typeof vi.fn> };
  let service: InterestApiService;

  beforeEach(() => {
    graphqlHttp = {
      request: vi.fn((query: string) => {
        if (query.includes('ConvertEventInterestToSubscription')) {
          return of({
            convertEventInterestToSubscription: {
              interest: interestFixture(),
              personId: 'person-1',
              eventSubscriptionId: 'subscription-1',
              subscriptionStatus: 'CONFIRMED',
            },
          });
        }
        if (query.includes('EventInterestCount')) {
          return of({ eventInterestCount: 12 });
        }
        return of({ eventInterests: [interestFixture()] });
      }),
    };

    TestBed.configureTestingModule({
      providers: [
        InterestApiService,
        { provide: GraphqlHttpService, useValue: graphqlHttp },
        { provide: HttpClient, useValue: {} },
      ],
    });

    service = TestBed.inject(InterestApiService);
  });

  it('lists interests by target with the person projection and paging variables', async () => {
    await expect(
      firstValueFrom(service.listInterests(InterestTargetType.EVENT, 'event-1', { query: 'Ana', skip: 0, take: 51 })),
    ).resolves.toEqual([interestFixture()]);

    expect(graphqlHttp.request).toHaveBeenCalledWith(
      expect.stringContaining('query AdminEventInterests'),
      { targetType: 'EVENT', targetId: 'event-1', query: 'Ana', skip: 0, take: 51 },
    );
    expect(graphqlHttp.request).toHaveBeenCalledWith(expect.stringContaining('person { id name email }'), expect.anything());
    await expect(firstValueFrom(service.countInterests(InterestTargetType.EVENT, 'event-1', 'Ana'))).resolves.toBe(12);
  });

  it('converts an interest while preserving selected event IDs', async () => {
    const input = { interestId: 'interest-1', selectedEventIds: ['event-1'] };
    await expect(firstValueFrom(service.convertInterestToSubscription(input))).resolves.toMatchObject({
      personId: 'person-1',
      eventSubscriptionId: 'subscription-1',
    });

    expect(graphqlHttp.request).toHaveBeenCalledWith(
      expect.stringContaining('mutation ConvertEventInterestToSubscription'),
      { input },
    );
  });
});

function interestFixture() {
  return {
    id: 'interest-1',
    personId: 'person-1',
    person: { id: 'person-1', name: 'Ana Clara', email: 'ana@example.com' },
    targetType: 'EVENT',
    targetId: 'event-1',
    eventId: 'event-1',
    eventGroupId: null,
    majorEventId: null,
    createdAt: '2026-09-13T12:00:00.000Z',
    updatedAt: '2026-09-13T12:00:00.000Z',
    createdById: 'person-1',
  };
}
