import { Prisma } from '@prisma/client';
import { MovedRelationsSnapshot } from './types';

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
  const insertedAttendanceRows = sourceAttendances.filter(
    (attendance) => !targetAttendanceSet.has(attendance.eventId),
  );

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
  const targetEventSubscriptionSet = new Set(
    targetEventSubscriptions.map((subscription) => subscription.eventId),
  );
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
  };
}
