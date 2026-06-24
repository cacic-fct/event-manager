import { RATE_LIMIT_METADATA_KEY } from '../rate-limit/rate-limit.decorator';
import { RATE_LIMIT_POLICIES } from '../rate-limit/rate-limit.policies';
import { PublicMajorEventsResolver } from './major-events.resolver';

describe('PublicMajorEventsResolver', () => {
  it('uses a bounded Typesense page for public major-event search pagination', async () => {
    const prisma = {
      majorEvent: {
        findMany: jest.fn().mockResolvedValue([createMajorEventRecord('major-1')]),
      },
    };
    const typesenseSearch = {
      isEnabled: jest.fn().mockReturnValue(true),
      searchMajorEvents: jest.fn().mockResolvedValue({
        available: true,
        ids: ['major-1'],
      }),
    };
    const resolver = new PublicMajorEventsResolver(prisma as never, typesenseSearch as never);

    await expect(
      resolver.publicMajorEvents(' congresso ', undefined, undefined, 10_000, 1_000),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'major-1',
        name: 'Major 1',
      }),
    ]);

    expect(typesenseSearch.searchMajorEvents).toHaveBeenCalledWith('congresso', {
      limit: 1_000,
      offset: 10_000,
    });
    expect(prisma.majorEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          id: {
            in: ['major-1'],
          },
        },
        skip: 0,
        take: 1,
      }),
    );
  });

  it('applies the public events rate-limit policy', () => {
    const metadata = Reflect.getMetadata(RATE_LIMIT_METADATA_KEY, PublicMajorEventsResolver.prototype.publicMajorEvents);

    expect(metadata).toEqual({
      policy: RATE_LIMIT_POLICIES.publicEvents,
      resources: [],
    });
  });
});

function createMajorEventRecord(id: string) {
  return {
    id,
    name: 'Major 1',
    emoji: null,
    startDate: new Date('2026-06-24T12:00:00.000Z'),
    endDate: new Date('2026-06-25T12:00:00.000Z'),
    description: null,
    buttonText: null,
    buttonLink: null,
    contactInfo: null,
    contactType: null,
    subscriptionStartDate: null,
    subscriptionEndDate: null,
    maxCoursesPerAttendee: null,
    maxLecturesPerAttendee: null,
    maxUncategorizedPerAttendee: null,
    rankedSubscriptionEnabled: false,
    isPaymentRequired: false,
    additionalPaymentInfo: null,
    certificateConfigs: [],
    majorEventPrices: [],
  };
}
