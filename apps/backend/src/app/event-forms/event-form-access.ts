import { EventFormResponseMode, Prisma } from '@prisma/client';
import { EventFormLinkRecord, EventFormRecord, NormalizedTarget } from './event-form-records';

export type AccessibleEventTargets = {
  eventIds: Set<string>;
  majorEventIds: Set<string>;
  eventGroupIds: Set<string>;
};

export function isEmptyAccessibleTargets(targets: AccessibleEventTargets): boolean {
  return targets.eventIds.size === 0 && targets.majorEventIds.size === 0 && targets.eventGroupIds.size === 0;
}

export function buildAccessibleFormWhere(accessibleTargets: AccessibleEventTargets): Prisma.EventFormWhereInput {
  const eventIds = [...accessibleTargets.eventIds];
  const majorEventIds = [...accessibleTargets.majorEventIds];
  const eventGroupIds = [...accessibleTargets.eventGroupIds];
  const or: Prisma.EventFormWhereInput[] = [];

  if (eventIds.length > 0) {
    or.push({ ownerEventId: { in: eventIds } });
    or.push({ links: { some: { eventId: { in: eventIds }, deletedAt: null } } });
  }

  if (majorEventIds.length > 0) {
    or.push({ ownerMajorEventId: { in: majorEventIds } });
    or.push({ ownerEvent: { majorEventId: { in: majorEventIds } } });
    or.push({
      OR: [
        { links: { some: { majorEventId: { in: majorEventIds }, deletedAt: null } } },
        { links: { some: { event: { majorEventId: { in: majorEventIds } }, deletedAt: null } } },
      ],
    });
  }

  if (eventGroupIds.length > 0) {
    or.push({ ownerEvent: { eventGroupId: { in: eventGroupIds } } });
    or.push({ links: { some: { event: { eventGroupId: { in: eventGroupIds } }, deletedAt: null } } });
  }

  return { OR: or };
}

export function resultResponseWhere(
  form: EventFormRecord,
  options: {
    target?: NormalizedTarget;
    accessibleTargets?: AccessibleEventTargets;
  },
): Prisma.EventFormResponseWhereInput {
  const where: Prisma.EventFormResponseWhereInput = { formId: form.id, deletedAt: null };
  if (form.responseMode === EventFormResponseMode.SINGLE_PER_FORM) {
    if (options.target) {
      return {
        ...where,
        targetType: options.target.targetType,
        eventId: options.target.eventId,
        majorEventId: options.target.majorEventId,
      };
    }
    if (options.accessibleTargets && !formIntersectsAccessibleTargets(form, options.accessibleTargets)) {
      return { ...where, id: { in: [] } };
    }
    return options.accessibleTargets ? withAccessibleResponseTargets(where, options.accessibleTargets) : where;
  }

  if (options.target) {
    return {
      ...where,
      targetType: options.target.targetType,
      eventId: options.target.eventId,
      majorEventId: options.target.majorEventId,
    };
  }

  const targets = options.accessibleTargets;
  if (!targets) {
    return where;
  }

  return withAccessibleResponseTargets(where, targets);
}

function withAccessibleResponseTargets(
  where: Prisma.EventFormResponseWhereInput,
  targets: AccessibleEventTargets,
): Prisma.EventFormResponseWhereInput {
  const targetWhere: Prisma.EventFormResponseWhereInput[] = [];
  const eventIds = [...targets.eventIds];
  const majorEventIds = [...targets.majorEventIds];
  const eventGroupIds = [...targets.eventGroupIds];
  if (eventIds.length > 0) {
    targetWhere.push({ eventId: { in: eventIds } });
  }
  if (majorEventIds.length > 0) {
    targetWhere.push({ majorEventId: { in: majorEventIds } });
    targetWhere.push({ event: { majorEventId: { in: majorEventIds } } });
  }
  if (eventGroupIds.length > 0) {
    targetWhere.push({ event: { eventGroupId: { in: eventGroupIds } } });
  }

  return targetWhere.length > 0 ? { ...where, OR: targetWhere } : { ...where, id: { in: [] } };
}

function formIntersectsAccessibleTargets(form: EventFormRecord, targets: AccessibleEventTargets): boolean {
  if (form.ownerEventId && targets.eventIds.has(form.ownerEventId)) {
    return true;
  }
  if (form.ownerMajorEventId && targets.majorEventIds.has(form.ownerMajorEventId)) {
    return true;
  }
  if (form.ownerEvent?.majorEventId && targets.majorEventIds.has(form.ownerEvent.majorEventId)) {
    return true;
  }
  if (form.ownerEvent?.eventGroupId && targets.eventGroupIds.has(form.ownerEvent.eventGroupId)) {
    return true;
  }
  return form.links.some((link) => linkIntersectsAccessibleTargets(link, targets));
}

function linkIntersectsAccessibleTargets(link: EventFormLinkRecord, targets: AccessibleEventTargets): boolean {
  if (link.eventId && targets.eventIds.has(link.eventId)) {
    return true;
  }
  if (link.majorEventId && targets.majorEventIds.has(link.majorEventId)) {
    return true;
  }
  if (link.event?.eventGroupId && targets.eventGroupIds.has(link.event.eventGroupId)) {
    return true;
  }
  if (link.event?.majorEventId && targets.majorEventIds.has(link.event.majorEventId)) {
    return true;
  }
  return false;
}
