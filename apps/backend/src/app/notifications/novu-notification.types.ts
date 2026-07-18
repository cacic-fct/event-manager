import type { NovuSubscriberSession } from '@cacic-fct/shared-data-types';
import { Prisma, SubscriptionStatus } from '@prisma/client';

export type NotificationRecipient = {
  subscriberId: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  data?: Record<string, unknown>;
};

export type SubscriptionStatusNotification = {
  subscriptionId: string;
  majorEventId: string;
  majorEventName: string;
  previousStatus: SubscriptionStatus;
  nextStatus: SubscriptionStatus;
  recipient: NotificationRecipient;
  rejectionReason?: string | null;
};

export type OfflineAttendanceReviewQueuedNotification = {
  submissionId: string;
  eventId: string;
  eventName: string;
  recipients: NotificationRecipient[];
  submittedById: string;
  authorName?: string | null;
  submittedAt: Date;
};

export type CertificateAvailableNotification = {
  certificateId: string;
  configId: string;
  certificateName: string;
  targetName?: string | null;
  issuedAt: Date;
  recipient: NotificationRecipient;
};

export type EventFormAvailableNotification = {
  formId: string;
  linkId?: string | null;
  formName: string;
  targetType: 'EVENT' | 'MAJOR_EVENT';
  targetId: string;
  targetName: string;
  recipients: NotificationRecipient[];
  requiredSubscriptionForm?: boolean;
};

export type OnlineAttendanceAvailableNotification = {
  eventId: string;
  eventName: string;
  endsAt: Date;
  recipients: NotificationRecipient[];
};

export type NovuTriggerResponse = {
  acknowledged: boolean;
  status: string;
  error?: string[];
  transactionId?: string;
};

export type NovuTriggerRequest = {
  name: string;
  to: NotificationRecipient | NotificationRecipient[];
  transactionId: string;
  payload: Record<string, unknown>;
  overrides?: Record<string, unknown>;
};

export type MajorEventSubscriptionNotificationRecord = Prisma.MajorEventSubscriptionGetPayload<{
  select: {
    id: true;
    majorEventId: true;
    subscriptionStatus: true;
    receiptRejectionReason: true;
    majorEvent: {
      select: {
        name: true;
      };
    };
    person: {
      select: {
        id: true;
        name: true;
        email: true;
        phone: true;
        userId: true;
        user: {
          select: {
            id: true;
            email: true;
            name: true;
          };
        };
      };
    };
  };
}>;

export type { NovuSubscriberSession };
