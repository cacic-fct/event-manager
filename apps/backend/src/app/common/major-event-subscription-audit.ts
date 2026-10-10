import { MajorEventSubscription } from '@prisma/client';

type MajorEventSubscriptionAuditSource = Pick<
  MajorEventSubscription,
  | 'id'
  | 'majorEventId'
  | 'personId'
  | 'subscriptionStatus'
> &
  Partial<
    Pick<
      MajorEventSubscription,
      | 'amountPaid'
      | 'paymentDate'
      | 'paymentTier'
      | 'imageLicenseAgreementAccepted'
      | 'createdByMethod'
      | 'subscriptionFlow'
      | 'desiredCourses'
      | 'desiredLectures'
      | 'desiredUncategorized'
      | 'receiptRejectionReason'
    >
  >;

export function buildMajorEventSubscriptionAuditSnapshot(
  subscription: MajorEventSubscriptionAuditSource,
  selectedEventIds: readonly string[],
) {
  return {
    id: subscription.id,
    majorEventId: subscription.majorEventId,
    personId: subscription.personId,
    subscriptionStatus: subscription.subscriptionStatus,
    amountPaid: subscription.amountPaid ?? null,
    paymentDate: subscription.paymentDate?.toISOString() ?? null,
    paymentTier: subscription.paymentTier ?? null,
    imageLicenseAgreementAccepted: subscription.imageLicenseAgreementAccepted ?? false,
    ...(subscription.createdByMethod !== undefined ? { createdByMethod: subscription.createdByMethod } : {}),
    ...(subscription.subscriptionFlow !== undefined ? { subscriptionFlow: subscription.subscriptionFlow } : {}),
    ...(subscription.desiredCourses !== undefined ? { desiredCourses: subscription.desiredCourses } : {}),
    ...(subscription.desiredLectures !== undefined ? { desiredLectures: subscription.desiredLectures } : {}),
    ...(subscription.desiredUncategorized !== undefined
      ? { desiredUncategorized: subscription.desiredUncategorized }
      : {}),
    ...(subscription.receiptRejectionReason !== undefined
      ? { receiptRejectionReason: subscription.receiptRejectionReason }
      : {}),
    selectedEventIds: [...new Set(selectedEventIds)],
  };
}
