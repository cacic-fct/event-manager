import {
  PublicEvent,
  PublicEventGroup,
  PublicEventSubscriptionSummary,
  PublicMajorEvent,
  PublicMajorEventPrice,
  PublicMajorEventPriceTier,
  PublicMajorEventSubscriptionPage,
  PublicPaymentInfo,
  mapPublicMajorEvent,
  mapPublicPaymentInfo,
} from './models';

describe('public event models', () => {
  it('maps major events with optional values converted to undefined and nested price tiers', () => {
    const majorEvent = majorEventFixture({
      certificateConfigs: [{ id: 'config-1' }],
      paymentInfo: paymentInfoFixture(),
    });

    expect(mapPublicMajorEvent(majorEvent as never)).toEqual({
      id: 'major-event-1',
      name: 'Semana da Computacao',
      emoji: '💻',
      startDate: new Date('2026-05-21T12:00:00.000Z'),
      endDate: new Date('2026-05-23T12:00:00.000Z'),
      description: undefined,
      subscriptionStartDate: undefined,
      subscriptionEndDate: undefined,
      maxCoursesPerAttendee: undefined,
      maxLecturesPerAttendee: 2,
      maxUncategorizedPerAttendee: undefined,
      rankedSubscriptionEnabled: true,
      buttonText: undefined,
      buttonLink: undefined,
      contactInfo: 'contato@example.com',
      contactType: 'EMAIL',
      isPaymentRequired: true,
      additionalPaymentInfo: undefined,
      shouldIssueCertificate: true,
      paymentInfo: {
        id: 'payment-1',
        bankName: 'Banco',
        agency: '0001',
        account: '12345',
        holder: 'CACIC',
        document: '123',
        pixKey: undefined,
        pixCity: 'Presidente Prudente',
        majorEventId: 'major-event-1',
      },
      majorEventPrices: [
        {
          id: 'price-1',
          type: 'student',
          tiers: [
            {
              id: 'tier-1',
              name: 'Lote 1',
              value: 2500,
            },
          ],
        },
      ],
    });
  });

  it('maps payment info nullables to undefined', () => {
    expect(mapPublicPaymentInfo(paymentInfoFixture() as never)).toEqual({
      id: 'payment-1',
      bankName: 'Banco',
      agency: '0001',
      account: '12345',
      holder: 'CACIC',
      document: '123',
      pixKey: undefined,
      pixCity: 'Presidente Prudente',
      majorEventId: 'major-event-1',
    });
  });

  it('marks major events without active certificate configs as not issuing certificates', () => {
    expect(mapPublicMajorEvent(majorEventFixture({ certificateConfigs: [] }) as never).shouldIssueCertificate).toBe(
      false,
    );
  });

  it('keeps GraphQL model classes assignable for resolver return payloads', () => {
    expect(Object.assign(new PublicPaymentInfo(), paymentInfoFixture())).toMatchObject({
      id: 'payment-1',
      majorEventId: 'major-event-1',
    });
    expect(Object.assign(new PublicMajorEventPriceTier(), { id: 'tier-1', name: 'Lote 1', value: 2500 })).toMatchObject({
      id: 'tier-1',
      value: 2500,
    });
    expect(
      Object.assign(new PublicMajorEventPrice(), {
        id: 'price-1',
        type: 'student',
        tiers: [new PublicMajorEventPriceTier()],
      }),
    ).toMatchObject({ id: 'price-1', tiers: [{}] });
    expect(Object.assign(new PublicMajorEvent(), { ...majorEventFixture(), shouldIssueCertificate: true })).toMatchObject({
      id: 'major-event-1',
      rankedSubscriptionEnabled: true,
    });
    expect(Object.assign(new PublicEventGroup(), { id: 'group-1', name: 'Grupo', emoji: '📚' })).toMatchObject({
      id: 'group-1',
    });
    expect(
      Object.assign(new PublicEvent(), {
        id: 'event-1',
        name: 'Evento',
        startDate: new Date('2026-05-21T12:00:00.000Z'),
        endDate: new Date('2026-05-21T14:00:00.000Z'),
        emoji: '🎓',
        type: 'COURSE',
        queueCount: 0,
      }),
    ).toMatchObject({ id: 'event-1', queueCount: 0 });
    expect(Object.assign(new PublicEventSubscriptionSummary(), { eventId: 'event-1', hasAvailableSlots: true }))
      .toMatchObject({ eventId: 'event-1', hasAvailableSlots: true });
    expect(
      Object.assign(new PublicMajorEventSubscriptionPage(), {
        majorEvent: new PublicMajorEvent(),
        events: [new PublicEvent()],
        subscriptionSummaries: [new PublicEventSubscriptionSummary()],
      }),
    ).toMatchObject({ events: [{}], subscriptionSummaries: [{}] });
  });
});

function majorEventFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'major-event-1',
    name: 'Semana da Computacao',
    emoji: '💻',
    startDate: new Date('2026-05-21T12:00:00.000Z'),
    endDate: new Date('2026-05-23T12:00:00.000Z'),
    description: null,
    subscriptionStartDate: null,
    subscriptionEndDate: null,
    maxCoursesPerAttendee: null,
    maxLecturesPerAttendee: 2,
    maxUncategorizedPerAttendee: null,
    rankedSubscriptionEnabled: true,
    buttonText: null,
    buttonLink: null,
    contactInfo: 'contato@example.com',
    contactType: 'EMAIL',
    isPaymentRequired: true,
    additionalPaymentInfo: null,
    certificateConfigs: [],
    majorEventPrices: [
      {
        id: 'price-1',
        type: 'student',
        tiers: [{ id: 'tier-1', name: 'Lote 1', value: 2500 }],
      },
    ],
    ...overrides,
  };
}

function paymentInfoFixture() {
  return {
    id: 'payment-1',
    bankName: 'Banco',
    agency: '0001',
    account: '12345',
    holder: 'CACIC',
    document: '123',
    pixKey: null,
    pixCity: 'Presidente Prudente',
    majorEventId: 'major-event-1',
  };
}
