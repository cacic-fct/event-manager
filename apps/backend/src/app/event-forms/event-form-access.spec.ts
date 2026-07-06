import { EventFormResponseMode, EventFormTargetType } from '@prisma/client';
import {
  buildAccessibleFormWhere,
  isEmptyAccessibleTargets,
  resultResponseWhere,
} from './event-form-access';
import { formRecord, linkRecord } from './event-form.spec-support';

describe('event form access helpers', () => {
  it('builds accessible form and response filters for scoped permissions', () => {
    const targets = {
      eventIds: new Set(['event-1']),
      majorEventIds: new Set(['major-1']),
      eventGroupIds: new Set(['group-1']),
    };

    expect(isEmptyAccessibleTargets({ eventIds: new Set(), majorEventIds: new Set(), eventGroupIds: new Set() })).toBe(
      true,
    );
    expect(buildAccessibleFormWhere(targets)).toEqual({
      OR: expect.arrayContaining([
        { ownerEventId: { in: ['event-1'] } },
        { ownerMajorEventId: { in: ['major-1'] } },
        { ownerEvent: { eventGroupId: { in: ['group-1'] } } },
        { links: { some: { eventId: { in: ['event-1'] }, deletedAt: null } } },
      ]),
    });

    expect(
      resultResponseWhere(
        formRecord({
          responseMode: EventFormResponseMode.SINGLE_PER_FORM,
          ownerEventId: 'owner-event',
          ownerEvent: { id: 'owner-event', name: 'Owner', majorEventId: 'other-major', eventGroupId: 'other-group' },
          links: [],
        }),
        { accessibleTargets: targets },
      ),
    ).toEqual({ formId: 'form-1', deletedAt: null, id: { in: [] } });
    expect(
      resultResponseWhere(
        formRecord({
          responseMode: EventFormResponseMode.SINGLE_PER_FORM,
          links: [
            linkRecord({
              eventId: 'event-1',
              event: { id: 'event-1', name: 'Credenciamento', majorEventId: null, eventGroupId: null },
            }),
          ],
        }),
        { accessibleTargets: targets },
      ),
    ).toEqual({
      formId: 'form-1',
      deletedAt: null,
      OR: expect.arrayContaining([
        { eventId: { in: ['event-1'] } },
        { majorEventId: { in: ['major-1'] } },
        { event: { eventGroupId: { in: ['group-1'] } } },
      ]),
    });
    expect(
      resultResponseWhere(formRecord(), {
        target: { targetType: EventFormTargetType.EVENT, eventId: 'event-1', majorEventId: null },
      }),
    ).toEqual({
      formId: 'form-1',
      deletedAt: null,
      targetType: EventFormTargetType.EVENT,
      eventId: 'event-1',
      majorEventId: null,
    });
  });
});
