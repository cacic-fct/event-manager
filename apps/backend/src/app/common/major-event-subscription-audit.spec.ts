import {
  MajorEventSubscriptionFlow,
  SubscriptionCreationMethod,
  SubscriptionStatus,
} from '@prisma/client';
import { diffAuditRecords } from '../audit-log/audit-log.snapshots';
import { buildMajorEventSubscriptionAuditSnapshot } from './major-event-subscription-audit';

describe('buildMajorEventSubscriptionAuditSnapshot', () => {
  it('keeps ranked preferences and selection order without related snapshots', () => {
    const beforeSource = {
      id: 'subscription-1',
      majorEventId: 'major-1',
      personId: 'person-1',
      subscriptionStatus: SubscriptionStatus.CONFIRMED,
      amountPaid: 1000,
      paymentDate: null,
      paymentTier: 'student',
      imageLicenseAgreementAccepted: false,
      createdByMethod: SubscriptionCreationMethod.SELF_SUBSCRIPTION,
      subscriptionFlow: MajorEventSubscriptionFlow.RANKED_VOTING,
      desiredCourses: 1,
      desiredLectures: 2,
      desiredUncategorized: 0,
      receiptRejectionReason: null,
      majorEvent: { id: 'major-1', name: 'Related event details' },
      person: { id: 'person-1', email: 'person@example.com' },
    };
    const before = buildMajorEventSubscriptionAuditSnapshot(beforeSource, ['course-a', 'course-b']);
    const after = buildMajorEventSubscriptionAuditSnapshot(
      {
        id: 'subscription-1',
        majorEventId: 'major-1',
        personId: 'person-1',
        subscriptionStatus: SubscriptionStatus.CONFIRMED,
        amountPaid: 1000,
        paymentDate: null,
        paymentTier: 'student',
        imageLicenseAgreementAccepted: false,
        createdByMethod: 'SELF_SUBSCRIPTION',
        subscriptionFlow: MajorEventSubscriptionFlow.RANKED_VOTING,
        desiredCourses: 2,
        desiredLectures: 2,
        desiredUncategorized: 0,
        receiptRejectionReason: null,
      },
      ['course-b', 'course-a'],
    );

    expect(before).toEqual(
      expect.objectContaining({
        subscriptionFlow: MajorEventSubscriptionFlow.RANKED_VOTING,
        desiredCourses: 1,
        desiredLectures: 2,
        selectedEventIds: ['course-a', 'course-b'],
      }),
    );
    expect(after).toEqual(
      expect.objectContaining({
        subscriptionFlow: MajorEventSubscriptionFlow.RANKED_VOTING,
        desiredCourses: 2,
        desiredLectures: 2,
        selectedEventIds: ['course-b', 'course-a'],
      }),
    );
    expect(after).not.toHaveProperty('majorEvent');
    expect(after).not.toHaveProperty('person');
    expect(diffAuditRecords(before, after).map(({ field }) => field)).toEqual(['desiredCourses', 'selectedEventIds']);
  });
});
