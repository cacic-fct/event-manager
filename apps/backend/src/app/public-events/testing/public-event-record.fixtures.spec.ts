import {
  createPublicEventRecord,
  createPublicMajorEventRecord,
} from './public-event-record.fixtures';

describe('public event record fixtures', () => {
  it('builds public major event records with defaults and overrides', () => {
    expect(createPublicMajorEventRecord()).toMatchObject({
      id: 'major-1',
      isPaymentRequired: false,
    });

    expect(
      createPublicMajorEventRecord({
        id: 'major-2',
        isPaymentRequired: true,
      }),
    ).toMatchObject({
      id: 'major-2',
      name: 'Major 1',
      isPaymentRequired: true,
      rankedSubscriptionEnabled: false,
      certificateConfigs: [],
      majorEventPrices: [],
    });
  });

  it('builds public event records with defaults and overrides', () => {
    expect(createPublicEventRecord()).toMatchObject({
      id: 'event-1',
      allowSubscription: true,
    });

    expect(
      createPublicEventRecord({
        id: 'event-2',
        majorEventId: 'major-1',
        slotsAvailable: 12,
      }),
    ).toMatchObject({
      id: 'event-2',
      name: 'Evento público',
      majorEventId: 'major-1',
      slotsAvailable: 12,
      allowSubscription: true,
      publiclyVisible: true,
      lecturers: [],
    });
  });
});
