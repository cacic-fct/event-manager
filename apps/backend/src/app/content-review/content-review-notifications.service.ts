import { Permission } from '@cacic-fct/shared-permissions';
import { Injectable, Logger } from '@nestjs/common';
import type { ContentReview } from '@prisma/client';
import { findPermissionNotificationRecipients } from '../authorization/permission-notification-recipients';
import { NovuNotificationsService } from '../notifications/novu-notifications.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContentReviewNotifications {
  private readonly logger = new Logger(ContentReviewNotifications.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NovuNotificationsService,
  ) {}

  async notify(review: ContentReview): Promise<void> {
    try {
      const event = review.eventId
        ? await this.prisma.event.findFirst({
            where: { id: review.eventId, deletedAt: null },
            select: { id: true, eventGroupId: true, majorEventId: true },
          })
        : null;
      if (review.eventId && !event) return;

      const recipients = await findPermissionNotificationRecipients({
        prisma: this.prisma,
        notifications: this.notifications,
        permissions: event
          ? [Permission.EventMaterials.Review, Permission.Event.Update]
          : [Permission.LecturerProfile.Review, Permission.Person.Update],
        event: event ?? undefined,
      });
      await this.notifications.notifyContentReviewQueued({
        id: review.id,
        revision: review.revision,
        kind: event ? 'materials' : 'profile',
        recipients,
      });
    } catch (error) {
      this.logger.warn(`Failed to notify reviewers for content review ${review.id}: ${String(error)}`);
    }
  }
}
