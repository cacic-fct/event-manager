import { Prisma, PublicationState, SubscriptionStatus } from '@prisma/client';

type MajorEventImageLicenseAgreementState = {
  imageLicenseAgreementAccepted: boolean;
  subscriptionStatus: SubscriptionStatus;
  selectedEvents: readonly unknown[];
  majorEvent: {
    requiresImageLicenseAgreement: boolean;
  };
};

export function requiredMajorEventImageLicenseAgreementWhere(
  personId: string,
  now: Date,
): Prisma.MajorEventSubscriptionWhereInput {
  return {
    personId,
    deletedAt: null,
    imageLicenseAgreementAccepted: false,
    subscriptionStatus: SubscriptionStatus.CONFIRMED,
    selectedEvents: {
      some: {
        deletedAt: null,
      },
    },
    majorEvent: {
      deletedAt: null,
      publicationState: PublicationState.PUBLISHED,
      endDate: { gt: now },
      requiresImageLicenseAgreement: true,
    },
  };
}

export function requiresMajorEventImageLicenseAgreement(subscription: MajorEventImageLicenseAgreementState): boolean {
  return (
    subscription.majorEvent.requiresImageLicenseAgreement &&
    !subscription.imageLicenseAgreementAccepted &&
    subscription.subscriptionStatus === SubscriptionStatus.CONFIRMED &&
    subscription.selectedEvents.length > 0
  );
}
