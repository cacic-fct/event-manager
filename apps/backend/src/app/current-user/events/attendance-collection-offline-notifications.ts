import { Permission } from '@cacic-fct/shared-permissions';
import { EventManagerPermissionGrantScope, Prisma, UserRole } from '@prisma/client';
import { NovuNotificationsService } from '../../notifications/novu-notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

type OfflineAttendanceReviewQueuedSubmission = {
  id: string;
  eventId: string;
  event: {
    name: string;
    majorEventId?: string | null;
    eventGroupId?: string | null;
  };
  submittedById: string;
  submittedAt: Date;
  authorName?: string | null;
};

export async function notifyOfflineAttendanceReviewQueued(params: {
  prisma: PrismaService;
  notifications: NovuNotificationsService;
  submission: OfflineAttendanceReviewQueuedSubmission;
}): Promise<void> {
  const recipients = await findOfflineAttendanceReviewRecipients(params);

  await params.notifications.notifyOfflineAttendanceReviewQueued({
    submissionId: params.submission.id,
    eventId: params.submission.eventId,
    eventName: params.submission.event.name,
    recipients,
    submittedById: params.submission.submittedById,
    submittedAt: params.submission.submittedAt,
    authorName: params.submission.authorName,
  });
}

async function findOfflineAttendanceReviewRecipients(params: {
  prisma: PrismaService;
  notifications: NovuNotificationsService;
  submission: OfflineAttendanceReviewQueuedSubmission;
}) {
  const now = new Date();
  const scopedGrantMatches: Prisma.EventManagerPermissionGrantWhereInput[] = [
    { scope: EventManagerPermissionGrantScope.GLOBAL },
    { scope: EventManagerPermissionGrantScope.EVENT, eventId: params.submission.eventId },
  ];
  if (params.submission.event.majorEventId) {
    scopedGrantMatches.push({
      scope: EventManagerPermissionGrantScope.MAJOR_EVENT,
      majorEventId: params.submission.event.majorEventId,
    });
  }
  if (params.submission.event.eventGroupId) {
    scopedGrantMatches.push({
      scope: EventManagerPermissionGrantScope.EVENT_GROUP,
      eventGroupId: params.submission.event.eventGroupId,
    });
  }

  const users = await params.prisma.user.findMany({
    where: {
      OR: [
        { role: UserRole.ADMIN },
        {
          eventManagerPermissionGrants: {
            some: {
              permission: Permission.EventAttendance.Update,
              deletedAt: null,
              OR: [{ validFrom: null }, { validFrom: { lte: now } }],
              AND: [{ OR: [{ validUntil: null }, { validUntil: { gt: now } }] }, { OR: scopedGrantMatches }],
            },
          },
        },
      ],
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  const recipientsBySubscriberId = new Map<
    string,
    {
      subscriberId: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      data?: Record<string, unknown>;
    }
  >();
  for (const user of users) {
    const recipient = params.notifications.mapUserToRecipient(user);
    recipientsBySubscriberId.set(recipient.subscriberId, recipient);
  }

  return Array.from(recipientsBySubscriberId.values());
}
