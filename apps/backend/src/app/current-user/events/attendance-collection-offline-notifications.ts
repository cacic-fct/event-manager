import { Permission } from '@cacic-fct/shared-permissions';
import { findPermissionNotificationRecipients } from '../../authorization/permission-notification-recipients';
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
  const recipients = await findPermissionNotificationRecipients({
    prisma: params.prisma,
    notifications: params.notifications,
    permissions: [Permission.EventAttendance.Update],
    event: { id: params.submission.eventId, ...params.submission.event },
  });

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
