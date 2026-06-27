import {
  createPublicEvent,
  createPublicEventGroup,
  createPublicMajorEvent,
  createPublicMajorEventPrice,
  createPublicPaymentInfo,
  createStoryPublicEvent,
  createStoryPublicEvents,
  createStoryPublicMajorEvent,
  createStoryPublicMajorEvents,
} from './public-entity-fixtures';

describe('public entity fixtures', () => {
  it('links event ids from nested major-event and event-group fixtures', () => {
    const majorEvent = createPublicMajorEvent({ id: 'major-custom', name: 'Grande evento customizado' });
    const eventGroup = createPublicEventGroup({ id: 'group-custom', name: 'Grupo customizado' });

    const event = createPublicEvent({
      id: 'event-custom',
      majorEvent,
      eventGroup,
    });

    expect(event).toEqual(
      expect.objectContaining({
        id: 'event-custom',
        majorEventId: 'major-custom',
        eventGroupId: 'group-custom',
        majorEvent: expect.objectContaining({ name: 'Grande evento customizado' }),
        eventGroup: expect.objectContaining({ name: 'Grupo customizado' }),
      }),
    );
  });

  it('keeps explicit null relationships for standalone public events', () => {
    const event = createPublicEvent({
      majorEvent: null,
      eventGroup: null,
    });

    expect(event.majorEvent).toBeNull();
    expect(event.eventGroup).toBeNull();
    expect(event.majorEventId).toBeNull();
    expect(event.eventGroupId).toBeNull();
  });

  it('creates paid major-event fixtures with nested payment and price data', () => {
    const paymentInfo = createPublicPaymentInfo({ id: 'payment-custom', pixKey: 'pix@cacic.dev.br' });
    const price = createPublicMajorEventPrice({
      id: 'price-custom',
      type: 'SINGLE',
      tiers: [{ id: 'tier-custom', name: 'Participante', value: 4500 }],
    });

    const majorEvent = createPublicMajorEvent({
      isPaymentRequired: true,
      paymentInfo,
      majorEventPrices: [price],
    });

    expect(majorEvent.isPaymentRequired).toBe(true);
    expect(majorEvent.paymentInfo).toEqual(expect.objectContaining({ id: 'payment-custom' }));
    expect(majorEvent.majorEventPrices).toEqual([
      expect.objectContaining({
        id: 'price-custom',
        tiers: [expect.objectContaining({ value: 4500 })],
      }),
    ]);
  });

  it('caps generated story event lists and keeps linked ids coherent', () => {
    const events = createStoryPublicEvents({ count: 20 });

    expect(events).toHaveLength(8);
    for (const event of events) {
      expect(event.majorEventId).toBe(event.majorEvent?.id ?? null);
      expect(event.eventGroupId).toBe(event.eventGroup?.id ?? null);
      expect(event.lecturers?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('can generate standalone story events without major-event or group fixtures', () => {
    const events = createStoryPublicEvents({
      count: 2,
      includeMajorEvent: false,
      includeEventGroup: false,
    });

    expect(events).toEqual([
      expect.objectContaining({ majorEvent: null, majorEventId: null, eventGroup: null, eventGroupId: null }),
      expect.objectContaining({ majorEvent: null, majorEventId: null, eventGroup: null, eventGroupId: null }),
    ]);
  });

  it('applies story overrides after scenario defaults', () => {
    const event = createStoryPublicEvent(3, {
      allowSubscription: false,
      slots: null,
      name: 'Atividade sem inscrição',
    });

    expect(event).toEqual(
      expect.objectContaining({
        id: 'event-4',
        name: 'Atividade sem inscrição',
        allowSubscription: false,
        slots: null,
      }),
    );
  });

  it('creates mixed paid and free story major events by default', () => {
    const majorEvents = createStoryPublicMajorEvents({ count: 4 });

    expect(majorEvents.map((majorEvent) => majorEvent.isPaymentRequired)).toEqual([true, false, true, false]);
    expect(majorEvents[0].paymentInfo).toEqual(expect.objectContaining({ majorEventId: 'major-1' }));
    expect(majorEvents[1].paymentInfo).toBeNull();
  });

  it('allows forcing story major-event payment and ranking modes', () => {
    const majorEvent = createStoryPublicMajorEvent(1, {
      requiresPayment: true,
      rankedSubscriptionEnabled: true,
    });

    expect(majorEvent.isPaymentRequired).toBe(true);
    expect(majorEvent.rankedSubscriptionEnabled).toBe(true);
    expect(majorEvent.majorEventPrices).toHaveLength(1);
  });
});
