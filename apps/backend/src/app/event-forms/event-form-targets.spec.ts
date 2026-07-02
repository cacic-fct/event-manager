import { BadRequestException } from '@nestjs/common';
import {
  EventFormAudience,
  EventFormResponseMode,
  EventFormResponseSource,
  EventFormSigilo,
  EventFormTargetType,
} from '@prisma/client';
import {
  assertSubscriptionFlowTargetAllowed,
  findEventLinkRecord,
  findLinkForTarget,
  findLinkRecordForTarget,
  formOwnerTargetInput,
  formTargetInputs,
  isLinkAvailable,
  manageableLinksForReplace,
  normalizeOwner,
  normalizeTarget,
  ownerTargetInput,
  responseLookupWhere,
  toDbAudience,
  toDbResponseMode,
  toDbResponseSource,
  toDbSigilo,
} from './event-form-targets';

describe('event form target helpers', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('normalizes owners and rejects ambiguous ownership', () => {
    expect(normalizeOwner({ name: 'Formulario', ownerEventId: ' event-1 ' } as never)).toEqual({
      ownerEventId: 'event-1',
      ownerMajorEventId: null,
    });

    expect(() =>
      normalizeOwner({
        name: 'Formulario',
        ownerEventId: 'event-1',
        ownerMajorEventId: 'major-1',
      } as never),
    ).toThrow(BadRequestException);
    expect(() => normalizeOwner({ name: 'Formulario' } as never)).toThrow(BadRequestException);
  });

  it('keeps subscription-flow required forms scoped to selected targets', () => {
    const scope = {
      majorEventId: 'major-1',
      selectedEventIds: new Set(['event-1']),
    };

    expect(() =>
      assertSubscriptionFlowTargetAllowed(
        { targetType: EventFormTargetType.EVENT, eventId: 'event-1' },
        scope,
      ),
    ).not.toThrow();
    expect(() =>
      assertSubscriptionFlowTargetAllowed(
        { targetType: EventFormTargetType.MAJOR_EVENT, majorEventId: 'major-1' },
        scope,
      ),
    ).not.toThrow();
    expect(() =>
      assertSubscriptionFlowTargetAllowed(
        { targetType: EventFormTargetType.EVENT, eventId: 'event-2' },
        scope,
      ),
    ).toThrow(BadRequestException);
  });

  it('builds response lookup filters by response mode', () => {
    const target = normalizeTarget({ targetType: EventFormTargetType.EVENT, eventId: 'event-1' });

    expect(responseLookupWhere({ id: 'form-1', responseMode: EventFormResponseMode.MULTIPLE_PER_TARGET }, 'person-1', target)).toBeNull();
    expect(responseLookupWhere({ id: 'form-1', responseMode: EventFormResponseMode.SINGLE_PER_FORM }, 'person-1', target)).toEqual({
      formId: 'form-1',
      personId: 'person-1',
    });
    expect(responseLookupWhere({ id: 'form-1', responseMode: EventFormResponseMode.SINGLE_PER_TARGET }, 'person-1', target)).toEqual({
      formId: 'form-1',
      personId: 'person-1',
      targetType: EventFormTargetType.EVENT,
      eventId: 'event-1',
      majorEventId: null,
    });
  });

  it('includes removed and changed links when replacing manageable links', () => {
    const existingLinks = [
      { id: 'same', targetType: EventFormTargetType.EVENT, eventId: 'event-1', majorEventId: null },
      { id: 'changed', targetType: EventFormTargetType.EVENT, eventId: 'event-2', majorEventId: null },
      { id: 'removed', targetType: EventFormTargetType.MAJOR_EVENT, eventId: null, majorEventId: 'major-1' },
    ];
    const nextLinks = [
      { id: 'same', targetType: EventFormTargetType.EVENT, eventId: 'event-1', majorEventId: null },
      { id: 'changed', targetType: EventFormTargetType.EVENT, eventId: 'event-3', majorEventId: null },
    ];

    expect(manageableLinksForReplace(existingLinks, nextLinks)).toEqual([
      nextLinks[0],
      nextLinks[1],
      existingLinks[1],
      existingLinks[2],
    ]);
  });

  it('finds targets, checks availability windows, and passes shared enum values to Prisma enums', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
    const form = {
      id: 'form-1',
      ownerEventId: 'event-owner',
      ownerMajorEventId: null,
      links: [
        {
          id: 'event-link',
          targetType: EventFormTargetType.EVENT,
          eventId: 'event-1',
          majorEventId: null,
          event: { id: 'event-1' },
          availableFrom: new Date('2026-07-01T11:00:00.000Z'),
          availableUntil: new Date('2026-07-01T13:00:00.000Z'),
        },
        {
          id: 'major-link',
          targetType: EventFormTargetType.MAJOR_EVENT,
          eventId: null,
          majorEventId: 'major-1',
          event: null,
          availableFrom: null,
          availableUntil: new Date('2026-06-30T13:00:00.000Z'),
        },
      ],
    };

    expect(ownerTargetInput({ ownerEventId: null, ownerMajorEventId: 'major-owner' })).toEqual({
      targetType: EventFormTargetType.MAJOR_EVENT,
      majorEventId: 'major-owner',
    });
    expect(formOwnerTargetInput(form as never)).toEqual({
      targetType: EventFormTargetType.EVENT,
      eventId: 'event-owner',
    });
    expect(formTargetInputs(form as never)).toEqual([
      { targetType: EventFormTargetType.EVENT, eventId: 'event-owner' },
      form.links[0],
      form.links[1],
    ]);
    expect(findLinkForTarget({ links: form.links } as never, { targetType: EventFormTargetType.EVENT, eventId: 'event-1' }))
      .toBe(form.links[0]);
    expect(findEventLinkRecord(form as never, 'event-1')).toBe(form.links[0]);
    expect(
      findLinkRecordForTarget(form as never, {
        targetType: EventFormTargetType.MAJOR_EVENT,
        eventId: null,
        majorEventId: 'major-1',
      }),
    ).toBe(form.links[1]);
    expect(isLinkAvailable(form.links[0] as never)).toBe(true);
    expect(isLinkAvailable(form.links[1] as never)).toBe(false);
    expect(toDbSigilo(EventFormSigilo.PARTIALLY_SECRET)).toBe(EventFormSigilo.PARTIALLY_SECRET);
    expect(toDbAudience(EventFormAudience.SUBSCRIBERS)).toBe(EventFormAudience.SUBSCRIBERS);
    expect(toDbResponseMode(EventFormResponseMode.SINGLE_PER_TARGET)).toBe(
      EventFormResponseMode.SINGLE_PER_TARGET,
    );
    expect(toDbResponseSource(EventFormResponseSource.PUBLIC_FORM)).toBe(EventFormResponseSource.PUBLIC_FORM);

  });
});
