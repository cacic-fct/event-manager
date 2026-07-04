import { NotFoundException } from '@nestjs/common';
import {
  PersonLinkedResourceGroupType,
  PersonLinkedResourcePrisma,
} from './people-linked-resource-definitions';

export async function countPersonLinkedResourceGroups(
  prisma: PersonLinkedResourcePrisma,
  personId: string,
): Promise<Record<PersonLinkedResourceGroupType, number>> {
  const person = await prisma.people.findFirst({
    where: { id: personId, deletedAt: null },
    select: { id: true, userId: true, mergedIntoId: true },
  });

  if (!person) {
    throw new NotFoundException(`Person ${personId} was not found.`);
  }

  const [
    certificate,
    eventSubscription,
    eventGroupSubscription,
    majorEventSubscription,
    attendance,
    lecture,
    attendanceCollector,
    offlineAttendanceSubmission,
    permissionGrant,
    lecturerProfile,
    mergedFrom,
    mergeCandidate,
    mergeOperationAsTarget,
    mergeOperationAsSource,
    receipt,
  ] = await Promise.all([
    prisma.certificate.count({ where: { personId, deletedAt: null } }),
    prisma.eventSubscription.count({ where: { personId, deletedAt: null } }),
    prisma.eventGroupSubscription.count({ where: { personId, deletedAt: null } }),
    prisma.majorEventSubscription.count({ where: { personId, deletedAt: null } }),
    prisma.eventAttendance.count({ where: { personId } }),
    prisma.eventLecturer.count({ where: { personId } }),
    prisma.eventAttendanceCollector.count({ where: { personId } }),
    prisma.offlineEventAttendanceSubmission.count({ where: { personId } }),
    prisma.eventManagerPermissionGrant.count({ where: { personId, deletedAt: null } }),
    prisma.lecturerProfile.findUnique({ where: { personId }, select: { id: true } }),
    prisma.people.count({ where: { mergedIntoId: personId, deletedAt: null } }),
    prisma.mergeCandidate.count({ where: { OR: [{ personAId: personId }, { personBId: personId }] } }),
    prisma.peopleMergeOperation.count({ where: { targetPersonId: personId } }),
    prisma.peopleMergeOperation.count({ where: { sourcePersonId: personId } }),
    prisma.majorEventReceipt.count({ where: { personId } }),
  ]);

  return {
    USER: person.userId ? 1 : 0,
    CERTIFICATE: certificate,
    SUBSCRIPTION: eventSubscription + eventGroupSubscription + majorEventSubscription,
    ATTENDANCE: attendance,
    EVENT_RELATION: lecture + attendanceCollector,
    OFFLINE_ATTENDANCE_SUBMISSION: offlineAttendanceSubmission,
    RECEIPT: receipt,
    LECTURER_PROFILE: lecturerProfile ? 1 : 0,
    PERMISSION_GRANT: permissionGrant,
    MERGE:
      (person.mergedIntoId ? 1 : 0) +
      mergedFrom +
      mergeCandidate +
      mergeOperationAsTarget +
      mergeOperationAsSource,
  };
}

export async function personHasLinkedData(
  prisma: PersonLinkedResourcePrisma,
  person: { id: string; userId: string | null; mergedIntoId: string | null },
): Promise<boolean> {
  if (person.userId || person.mergedIntoId) {
    return true;
  }

  const [
    certificate,
    eventSubscription,
    eventGroupSubscription,
    majorEventSubscription,
    attendance,
    lecture,
    attendanceCollector,
    offlineAttendanceSubmission,
    permissionGrant,
    lecturerProfile,
    mergedFrom,
    mergeCandidate,
    mergeOperationAsTarget,
    mergeOperationAsSource,
    receipt,
  ] = await Promise.all([
    prisma.certificate.findFirst({ where: { personId: person.id, deletedAt: null }, select: { id: true } }),
    prisma.eventSubscription.findFirst({ where: { personId: person.id, deletedAt: null }, select: { id: true } }),
    prisma.eventGroupSubscription.findFirst({
      where: { personId: person.id, deletedAt: null },
      select: { id: true },
    }),
    prisma.majorEventSubscription.findFirst({
      where: { personId: person.id, deletedAt: null },
      select: { id: true },
    }),
    prisma.eventAttendance.findFirst({ where: { personId: person.id }, select: { personId: true } }),
    prisma.eventLecturer.findFirst({ where: { personId: person.id }, select: { personId: true } }),
    prisma.eventAttendanceCollector.findFirst({ where: { personId: person.id }, select: { personId: true } }),
    prisma.offlineEventAttendanceSubmission.findFirst({ where: { personId: person.id }, select: { id: true } }),
    prisma.eventManagerPermissionGrant.findFirst({
      where: { personId: person.id, deletedAt: null },
      select: { id: true },
    }),
    prisma.lecturerProfile.findUnique({ where: { personId: person.id }, select: { id: true } }),
    prisma.people.findFirst({
      where: { mergedIntoId: person.id, deletedAt: null },
      select: { id: true },
    }),
    prisma.mergeCandidate.findFirst({
      where: { OR: [{ personAId: person.id }, { personBId: person.id }] },
      select: { id: true },
    }),
    prisma.peopleMergeOperation.findFirst({ where: { targetPersonId: person.id }, select: { id: true } }),
    prisma.peopleMergeOperation.findFirst({ where: { sourcePersonId: person.id }, select: { id: true } }),
    prisma.majorEventReceipt.findFirst({ where: { personId: person.id }, select: { id: true } }),
  ]);

  return Boolean(
    certificate ||
      eventSubscription ||
      eventGroupSubscription ||
      majorEventSubscription ||
      attendance ||
      lecture ||
      attendanceCollector ||
      offlineAttendanceSubmission ||
      permissionGrant ||
      lecturerProfile ||
      mergedFrom ||
      mergeCandidate ||
      mergeOperationAsTarget ||
      mergeOperationAsSource ||
      receipt,
  );
}
