import { PublicationState, SubscriptionStatus } from '@prisma/client';
import {
  requiredMajorEventImageLicenseAgreementWhere,
  requiresMajorEventImageLicenseAgreement,
} from './image-license-agreement';

describe('major-event image-license agreement eligibility', () => {
  it('shares the confirmed regular-event subscription predicate', () => {
    const now = new Date('2026-08-16T15:00:00.000Z');

    expect(requiredMajorEventImageLicenseAgreementWhere('person-1', now)).toEqual({
      personId: 'person-1',
      deletedAt: null,
      imageLicenseAgreementAccepted: false,
      subscriptionStatus: SubscriptionStatus.CONFIRMED,
      selectedEvents: { some: { deletedAt: null } },
      majorEvent: {
        deletedAt: null,
        publicationState: PublicationState.PUBLISHED,
        endDate: { gt: now },
        requiresImageLicenseAgreement: true,
      },
    });
  });

  it('excludes pending-payment and tournament-only subscriptions from regular subscription actions', () => {
    const base = {
      imageLicenseAgreementAccepted: false,
      subscriptionStatus: SubscriptionStatus.CONFIRMED,
      selectedEvents: [{ id: 'event-1' }],
      majorEvent: { requiresImageLicenseAgreement: true },
    };

    expect(requiresMajorEventImageLicenseAgreement(base)).toBe(true);
    expect(
      requiresMajorEventImageLicenseAgreement({
        ...base,
        subscriptionStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
      }),
    ).toBe(false);
    expect(requiresMajorEventImageLicenseAgreement({ ...base, selectedEvents: [] })).toBe(false);
  });
});
