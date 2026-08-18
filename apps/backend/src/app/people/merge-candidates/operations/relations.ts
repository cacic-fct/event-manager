import { EventManagerPermissionArchiveReason, Prisma } from '@prisma/client';
import {
  intersectPermissionRelationValidity,
  normalizePermissionRelationValidity,
  permissionRelationScopeKey,
  unionPermissionRelationValidity,
} from '../../permission-relation-validity';
import {
  MovedRelationsSnapshot,
  PermissionGroupMembershipSnapshot,
  RoleAssignmentScopeSnapshot,
  RoleAssignmentSnapshot,
} from './types';

export async function moveRelations(
  tx: Prisma.TransactionClient,
  targetPersonId: string,
  sourcePersonId: string,
): Promise<MovedRelationsSnapshot> {
  const sourceAttendances = await tx.eventAttendance.findMany({
    where: {
      personId: sourcePersonId,
    },
  });

  const sourceAttendanceEventIds = sourceAttendances.map((attendance) => attendance.eventId);
  const targetAttendances = sourceAttendanceEventIds.length
    ? await tx.eventAttendance.findMany({
        where: {
          personId: targetPersonId,
          eventId: {
            in: sourceAttendanceEventIds,
          },
        },
        select: {
          eventId: true,
        },
      })
    : [];

  const targetAttendanceSet = new Set(targetAttendances.map((attendance) => attendance.eventId));
  const insertedAttendanceRows = sourceAttendances.filter((attendance) => !targetAttendanceSet.has(attendance.eventId));

  if (insertedAttendanceRows.length > 0) {
    await tx.eventAttendance.createMany({
      data: insertedAttendanceRows.map((attendance) => ({
        personId: targetPersonId,
        eventId: attendance.eventId,
        attendedAt: attendance.attendedAt,
        createdAt: attendance.createdAt,
        createdById: attendance.createdById,
        committedById: attendance.committedById,
      })),
      skipDuplicates: true,
    });
  }

  if (sourceAttendances.length > 0) {
    await tx.eventAttendance.deleteMany({
      where: {
        personId: sourcePersonId,
      },
    });
  }

  const sourceLectures = await tx.eventLecturer.findMany({
    where: {
      personId: sourcePersonId,
    },
  });

  const sourceLectureEventIds = sourceLectures.map((lecture) => lecture.eventId);
  const targetLectures = sourceLectureEventIds.length
    ? await tx.eventLecturer.findMany({
        where: {
          personId: targetPersonId,
          eventId: {
            in: sourceLectureEventIds,
          },
        },
        select: {
          eventId: true,
        },
      })
    : [];

  const targetLectureSet = new Set(targetLectures.map((lecture) => lecture.eventId));
  const insertedLectureRows = sourceLectures.filter((lecture) => !targetLectureSet.has(lecture.eventId));

  if (insertedLectureRows.length > 0) {
    await tx.eventLecturer.createMany({
      data: insertedLectureRows.map((lecture) => ({
        personId: targetPersonId,
        eventId: lecture.eventId,
        createdAt: lecture.createdAt,
        createdById: lecture.createdById,
      })),
      skipDuplicates: true,
    });
  }

  if (sourceLectures.length > 0) {
    await tx.eventLecturer.deleteMany({
      where: {
        personId: sourcePersonId,
      },
    });
  }

  const sourceEventSubscriptions = await tx.eventSubscription.findMany({
    where: {
      personId: sourcePersonId,
    },
    select: {
      id: true,
      eventId: true,
    },
  });

  const sourceEventSubscriptionEventIds = sourceEventSubscriptions.map((subscription) => subscription.eventId);
  const targetEventSubscriptions = sourceEventSubscriptionEventIds.length
    ? await tx.eventSubscription.findMany({
        where: {
          personId: targetPersonId,
          eventId: {
            in: sourceEventSubscriptionEventIds,
          },
        },
        select: {
          eventId: true,
        },
      })
    : [];
  const targetEventSubscriptionSet = new Set(targetEventSubscriptions.map((subscription) => subscription.eventId));
  const movedEventSubscriptionIds = sourceEventSubscriptions
    .filter((subscription) => !targetEventSubscriptionSet.has(subscription.eventId))
    .map((subscription) => subscription.id);
  if (movedEventSubscriptionIds.length > 0) {
    await tx.eventSubscription.updateMany({
      where: {
        id: {
          in: movedEventSubscriptionIds,
        },
      },
      data: {
        personId: targetPersonId,
      },
    });
  }

  const sourceEventGroupSubscriptions = await tx.eventGroupSubscription.findMany({
    where: {
      personId: sourcePersonId,
    },
    select: {
      id: true,
      eventGroupId: true,
    },
  });

  const sourceEventGroupSubscriptionGroupIds = sourceEventGroupSubscriptions.map(
    (subscription) => subscription.eventGroupId,
  );
  const targetEventGroupSubscriptions = sourceEventGroupSubscriptionGroupIds.length
    ? await tx.eventGroupSubscription.findMany({
        where: {
          personId: targetPersonId,
          eventGroupId: {
            in: sourceEventGroupSubscriptionGroupIds,
          },
        },
        select: {
          eventGroupId: true,
        },
      })
    : [];
  const targetEventGroupSubscriptionSet = new Set(
    targetEventGroupSubscriptions.map((subscription) => subscription.eventGroupId),
  );
  const movedEventGroupSubscriptionIds = sourceEventGroupSubscriptions
    .filter((subscription) => !targetEventGroupSubscriptionSet.has(subscription.eventGroupId))
    .map((subscription) => subscription.id);
  if (movedEventGroupSubscriptionIds.length > 0) {
    await tx.eventGroupSubscription.updateMany({
      where: {
        id: {
          in: movedEventGroupSubscriptionIds,
        },
      },
      data: {
        personId: targetPersonId,
      },
    });
  }

  const sourceMajorEventSubscriptions = await tx.majorEventSubscription.findMany({
    where: {
      personId: sourcePersonId,
    },
    select: {
      id: true,
      majorEventId: true,
    },
  });

  const sourceMajorEventSubscriptionMajorEventIds = sourceMajorEventSubscriptions.map(
    (subscription) => subscription.majorEventId,
  );
  const targetMajorEventSubscriptions = sourceMajorEventSubscriptionMajorEventIds.length
    ? await tx.majorEventSubscription.findMany({
        where: {
          personId: targetPersonId,
          majorEventId: {
            in: sourceMajorEventSubscriptionMajorEventIds,
          },
        },
        select: {
          majorEventId: true,
        },
      })
    : [];
  const targetMajorEventSubscriptionSet = new Set(
    targetMajorEventSubscriptions.map((subscription) => subscription.majorEventId),
  );
  const movedMajorEventSubscriptionIds = sourceMajorEventSubscriptions
    .filter((subscription) => !targetMajorEventSubscriptionSet.has(subscription.majorEventId))
    .map((subscription) => subscription.id);
  if (movedMajorEventSubscriptionIds.length > 0) {
    await tx.majorEventSubscription.updateMany({
      where: {
        id: {
          in: movedMajorEventSubscriptionIds,
        },
      },
      data: {
        personId: targetPersonId,
      },
    });
  }

  const movedRoleAssignmentIds: string[] = [];
  const archivedRoleAssignmentIds: string[] = [];
  const roleAssignmentSnapshots: RoleAssignmentSnapshot[] = [];
  const roleAssignmentScopeSnapshots: RoleAssignmentScopeSnapshot[] = [];
  const sourceRoleAssignments = await tx.eventManagerRoleAssignment.findMany({
    where: { personId: sourcePersonId, archivedAt: null },
    select: {
      id: true,
      roleId: true,
      validFrom: true,
      validUntil: true,
      unlimited: true,
      scopes: {
        where: { archivedAt: null },
        select: {
          id: true,
          scope: true,
          eventId: true,
          majorEventId: true,
          eventGroupId: true,
          validFrom: true,
          validUntil: true,
          unlimited: true,
        },
      },
    },
  });
  for (const assignment of sourceRoleAssignments) {
    roleAssignmentSnapshots.push(toRoleAssignmentSnapshot(assignment, sourcePersonId));
    for (const scope of assignment.scopes ?? []) {
      roleAssignmentScopeSnapshots.push(toRoleAssignmentScopeSnapshot(scope, assignment.id));
    }
    const conflict = await tx.eventManagerRoleAssignment.findFirst({
      where: { roleId: assignment.roleId, personId: targetPersonId, archivedAt: null },
      select: {
        id: true,
        validFrom: true,
        validUntil: true,
        unlimited: true,
        scopes: {
          where: { archivedAt: null },
          select: {
            id: true,
            scope: true,
            eventId: true,
            majorEventId: true,
            eventGroupId: true,
            validFrom: true,
            validUntil: true,
            unlimited: true,
          },
        },
      },
    });
    if (conflict) {
      roleAssignmentSnapshots.push(toRoleAssignmentSnapshot(conflict, targetPersonId));
      for (const scope of conflict.scopes ?? []) {
        roleAssignmentScopeSnapshots.push(toRoleAssignmentScopeSnapshot(scope, conflict.id));
      }
      const sourceValidity = normalizePermissionRelationValidity(assignment);
      const targetValidity = normalizePermissionRelationValidity(conflict);
      const archivedAt = new Date();
      const targetScopes = new Map<
        string,
        { id: string; validity: ReturnType<typeof normalizePermissionRelationValidity> }
      >();

      for (const scope of conflict.scopes ?? []) {
        const effectiveValidity = intersectPermissionRelationValidity(
          normalizePermissionRelationValidity(scope),
          targetValidity,
        );
        if (!effectiveValidity) {
          await tx.eventManagerRoleAssignmentScope.update({
            where: { id: scope.id },
            data: { archivedAt, archivedReason: EventManagerPermissionArchiveReason.PERSON_MERGED },
          });
          continue;
        }
        await tx.eventManagerRoleAssignmentScope.update({ where: { id: scope.id }, data: effectiveValidity });
        targetScopes.set(permissionRelationScopeKey(scope), { id: scope.id, validity: effectiveValidity });
      }

      for (const scope of assignment.scopes ?? []) {
        const effectiveValidity = intersectPermissionRelationValidity(
          normalizePermissionRelationValidity(scope),
          sourceValidity,
        );
        if (!effectiveValidity) {
          await tx.eventManagerRoleAssignmentScope.update({
            where: { id: scope.id },
            data: { archivedAt, archivedReason: EventManagerPermissionArchiveReason.PERSON_MERGED },
          });
          continue;
        }

        const scopeKey = permissionRelationScopeKey(scope);
        const existingScope = targetScopes.get(scopeKey);
        if (existingScope) {
          await tx.eventManagerRoleAssignmentScope.update({
            where: { id: existingScope.id },
            data: unionPermissionRelationValidity(existingScope.validity, effectiveValidity),
          });
          await tx.eventManagerRoleAssignmentScope.update({
            where: { id: scope.id },
            data: { archivedAt, archivedReason: EventManagerPermissionArchiveReason.PERSON_MERGED },
          });
          continue;
        }

        await tx.eventManagerRoleAssignmentScope.update({
          where: { id: scope.id },
          data: { assignmentId: conflict.id, ...effectiveValidity },
        });
        targetScopes.set(scopeKey, { id: scope.id, validity: effectiveValidity });
      }

      await tx.eventManagerRoleAssignment.update({
        where: { id: conflict.id },
        data: unionPermissionRelationValidity(sourceValidity, targetValidity),
      });
      await tx.eventManagerRoleAssignment.update({
        where: { id: assignment.id },
        data: { archivedAt, archivedReason: EventManagerPermissionArchiveReason.PERSON_MERGED },
      });
      archivedRoleAssignmentIds.push(assignment.id);
    } else {
      await tx.eventManagerRoleAssignment.update({ where: { id: assignment.id }, data: { personId: targetPersonId } });
      movedRoleAssignmentIds.push(assignment.id);
    }
  }

  const movedPermissionGroupMembershipIds: string[] = [];
  const archivedPermissionGroupMembershipIds: string[] = [];
  const permissionGroupMembershipSnapshots: PermissionGroupMembershipSnapshot[] = [];
  const sourceMemberships = await tx.eventManagerPermissionGroupMember.findMany({
    where: { personId: sourcePersonId, archivedAt: null },
    select: { id: true, groupId: true, validFrom: true, validUntil: true, unlimited: true },
  });
  for (const membership of sourceMemberships) {
    permissionGroupMembershipSnapshots.push(toPermissionGroupMembershipSnapshot(membership, sourcePersonId));
    const conflict = await tx.eventManagerPermissionGroupMember.findFirst({
      where: { groupId: membership.groupId, personId: targetPersonId, archivedAt: null },
      select: { id: true, validFrom: true, validUntil: true, unlimited: true },
    });
    if (conflict) {
      permissionGroupMembershipSnapshots.push(toPermissionGroupMembershipSnapshot(conflict, targetPersonId));
      const archivedAt = new Date();
      await tx.eventManagerPermissionGroupMember.update({
        where: { id: conflict.id },
        data: unionPermissionRelationValidity(
          normalizePermissionRelationValidity(membership),
          normalizePermissionRelationValidity(conflict),
        ),
      });
      await tx.eventManagerPermissionGroupMember.update({
        where: { id: membership.id },
        data: { archivedAt, archivedReason: EventManagerPermissionArchiveReason.PERSON_MERGED },
      });
      archivedPermissionGroupMembershipIds.push(membership.id);
    } else {
      await tx.eventManagerPermissionGroupMember.update({ where: { id: membership.id }, data: { personId: targetPersonId } });
      movedPermissionGroupMembershipIds.push(membership.id);
    }
  }

  return {
    sourceAttendances: sourceAttendances.map((attendance) => ({
      eventId: attendance.eventId,
      attendedAt: attendance.attendedAt.toISOString(),
      createdAt: attendance.createdAt.toISOString(),
      createdById: attendance.createdById,
      committedById: attendance.committedById,
    })),
    sourceLectures: sourceLectures.map((lecture) => ({
      eventId: lecture.eventId,
      createdAt: lecture.createdAt.toISOString(),
      createdById: lecture.createdById,
    })),
    insertedAttendanceEventIds: insertedAttendanceRows.map((attendance) => attendance.eventId),
    insertedLectureEventIds: insertedLectureRows.map((lecture) => lecture.eventId),
    movedEventSubscriptionIds,
    movedEventGroupSubscriptionIds,
    movedMajorEventSubscriptionIds,
    movedRoleAssignmentIds,
    archivedRoleAssignmentIds,
    movedPermissionGroupMembershipIds,
    archivedPermissionGroupMembershipIds,
    roleAssignmentSnapshots,
    roleAssignmentScopeSnapshots,
    permissionGroupMembershipSnapshots,
  };
}

function toRoleAssignmentSnapshot(
  assignment: {
    id: string;
    personId?: string | null;
    validFrom?: Date | null;
    validUntil?: Date | null;
    unlimited?: boolean;
    archivedAt?: Date | null;
    archivedReason?: string | null;
  },
  personId: string,
): RoleAssignmentSnapshot {
  return {
    id: assignment.id,
    personId,
    validFrom: assignment.validFrom?.toISOString() ?? null,
    validUntil: assignment.validUntil?.toISOString() ?? null,
    unlimited: assignment.unlimited ?? (assignment.validUntil === null || assignment.validUntil === undefined),
    archivedAt: assignment.archivedAt?.toISOString() ?? null,
    archivedReason: assignment.archivedReason ?? null,
  };
}

function toRoleAssignmentScopeSnapshot(
  scope: {
    id: string;
    validFrom?: Date | null;
    validUntil?: Date | null;
    unlimited?: boolean;
    archivedAt?: Date | null;
    archivedReason?: string | null;
  },
  assignmentId: string,
): RoleAssignmentScopeSnapshot {
  return {
    id: scope.id,
    assignmentId,
    validFrom: scope.validFrom?.toISOString() ?? null,
    validUntil: scope.validUntil?.toISOString() ?? null,
    unlimited: scope.unlimited ?? (scope.validUntil === null || scope.validUntil === undefined),
    archivedAt: scope.archivedAt?.toISOString() ?? null,
    archivedReason: scope.archivedReason ?? null,
  };
}

function toPermissionGroupMembershipSnapshot(
  membership: {
    id: string;
    validFrom?: Date | null;
    validUntil?: Date | null;
    unlimited?: boolean;
    archivedAt?: Date | null;
    archivedReason?: string | null;
  },
  personId: string,
): PermissionGroupMembershipSnapshot {
  return {
    id: membership.id,
    personId,
    validFrom: membership.validFrom?.toISOString() ?? null,
    validUntil: membership.validUntil?.toISOString() ?? null,
    unlimited: membership.unlimited ?? (membership.validUntil === null || membership.validUntil === undefined),
    archivedAt: membership.archivedAt?.toISOString() ?? null,
    archivedReason: membership.archivedReason ?? null,
  };
}
