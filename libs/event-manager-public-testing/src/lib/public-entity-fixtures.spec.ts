import {
  createPublicEvent,
  createPublicEventForm,
  createPublicEventFormLink,
  createPublicEventGroup,
  createPublicMajorEvent,
  createPublicMajorEventPrice,
  createPublicPaymentInfo,
  createStoryPublicEvents,
  createStoryPublicMajorEvents,
  publicFixtureDate,
} from './public-entity-fixtures';

describe('public entity fixtures', () => {
  it('creates internally consistent event relationships from overrides', () => {
    const majorEvent = createPublicMajorEvent({ id: 'major-test', name: 'Grande Evento Teste' });
    const eventGroup = createPublicEventGroup({ id: 'group-test', name: 'Grupo Teste' });

    const event = createPublicEvent({
      id: 'event-test',
      majorEvent,
      eventGroup,
    });

    expect(event.majorEventId).toBe('major-test');
    expect(event.majorEvent).toBe(majorEvent);
    expect(event.eventGroupId).toBe('group-test');
    expect(event.eventGroup).toBe(eventGroup);
    expect(event.publiclyVisible).toBe(true);
  });

  it('creates payment fixtures that can be embedded in paid major-event stories', () => {
    const paymentInfo = createPublicPaymentInfo({ pixKey: 'financeiro@example.com' });
    const price = createPublicMajorEventPrice({
      type: 'SINGLE',
      tiers: [{ id: 'tier-1', name: 'Comunidade', value: 5000 }],
    });
    const majorEvent = createPublicMajorEvent({
      isPaymentRequired: true,
      paymentInfo,
      majorEventPrices: [price],
    });

    expect(majorEvent.isPaymentRequired).toBe(true);
    expect(majorEvent.paymentInfo?.pixKey).toBe('financeiro@example.com');
    expect(majorEvent.majorEventPrices?.[0]?.tiers[0]).toEqual({
      id: 'tier-1',
      name: 'Comunidade',
      value: 5000,
    });
  });

  it('defaults form links to the selected target type and keeps form ids aligned', () => {
    const eventLink = createPublicEventFormLink({ formId: 'form-event', targetType: 'EVENT', eventId: 'event-test' });
    const majorEventLink = createPublicEventFormLink({
      formId: 'form-major',
      targetType: 'MAJOR_EVENT',
      majorEventId: 'major-test',
    });

    const form = createPublicEventForm({
      id: 'form-major',
      links: [majorEventLink],
    });

    expect(eventLink).toEqual(expect.objectContaining({
      formId: 'form-event',
      eventId: 'event-test',
      majorEventId: null,
      target: expect.objectContaining({ type: 'EVENT', id: 'event-test' }),
    }));
    expect(majorEventLink).toEqual(expect.objectContaining({
      formId: 'form-major',
      eventId: null,
      majorEventId: 'major-test',
      target: expect.objectContaining({ type: 'MAJOR_EVENT', id: 'major-test' }),
    }));
    expect(form.links).toEqual([majorEventLink]);
  });

  it('bounds generated story collections while varying public event data', () => {
    const majorEvents = createStoryPublicMajorEvents({ count: 20, requiresPayment: true });
    const events = createStoryPublicEvents({
      count: 20,
      includeMajorEvent: true,
      includeEventGroup: true,
      allowSubscription: false,
    });

    expect(majorEvents).toHaveLength(8);
    expect(majorEvents.every((majorEvent) => majorEvent.isPaymentRequired)).toBe(true);
    expect(events).toHaveLength(8);
    expect(events[0]).toEqual(expect.objectContaining({
      allowSubscription: false,
      majorEventId: expect.any(String),
      eventGroupId: expect.any(String),
    }));
    expect(events[0]?.startDate).not.toBe(publicFixtureDate);
  });
});
