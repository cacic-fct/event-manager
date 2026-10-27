import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CertificateScope } from '@cacic-fct/shared-data-types';
import { CurrentUserCertificateParticipationResolver } from './certificate-participation.resolver';
const { jest } = import.meta;

function setup() {
  const event = {
    id: 'event',
    shouldIssueCertificate: true,
    endDate: new Date(Date.now() - 86_400_000),
    majorEventId: null as string | null,
    eventGroupId: null as string | null,
    majorEvent: null as { isPaymentRequired: boolean } | null,
    allowSubscription: false,
    autoSubscribe: false,
    shouldIssueCertificateForNonPayingAttendees: false,
    shouldIssueCertificateForNonSubscribedAttendees: false,
  };
  const config = { id: 'config', scope: 'EVENT', issuedTo: 'ATTENDEE', attendeeEligibility: null };
  const prisma = {
    event: { findMany: jest.fn().mockResolvedValue([event]), findFirst: jest.fn().mockResolvedValue(event) },
    certificateConfig: { findMany: jest.fn().mockResolvedValue([config]) },
    eventAttendance: { findMany: jest.fn().mockResolvedValue([{ eventId: 'event' }]) },
    offlineEventAttendanceSubmission: { count: jest.fn().mockResolvedValue(0) },
    majorEventSubscription: { findMany: jest.fn().mockResolvedValue([]) },
    eventSubscription: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const currentUser = { requireCurrentPerson: jest.fn().mockResolvedValue({ id: 'person' }) };
  const publicEvents = {
    requirePublicEvent: jest.fn().mockResolvedValue(event),
    requirePublicEventGroup: jest.fn().mockResolvedValue({ shouldIssueCertificate: true }),
    requirePublicMajorEvent: jest.fn().mockResolvedValue({ shouldIssueCertificate: true }),
  };
  const eligibility = { resolveEligibleRecipients: jest.fn().mockResolvedValue([]) };
  const resolver = new CurrentUserCertificateParticipationResolver(
    prisma as never,
    currentUser as never,
    publicEvents as never,
    eligibility as never,
  );
  const read = (scope = CertificateScope.EVENT) =>
    resolver.currentUserCertificateParticipation({} as never, scope, 'target');
  return { resolver, read, prisma, event, config, eligibility, currentUser, publicEvents };
}

describe('CurrentUserCertificateParticipationResolver', () => {
  it.each([CertificateScope.EVENT, CertificateScope.EVENT_GROUP, CertificateScope.MAJOR_EVENT])(
    'uses actual issuance eligibility for %s',
    async (scope) => {
      const { read, eligibility, prisma } = setup();
      eligibility.resolveEligibleRecipients.mockResolvedValue([{ events: [{ id: 'event' }] }]);
      await expect(read(scope)).resolves.toEqual({ status: 'ATTENDANCE_CONFIRMED' });
      expect(eligibility.resolveEligibleRecipients).toHaveBeenCalledWith(expect.anything(), 'person');
      expect(prisma.eventAttendance.findMany).not.toHaveBeenCalled();
    },
  );

  it('does not treat eligibility in an unrelated parent activity as eligibility here', async () => {
    const { read, eligibility } = setup();
    eligibility.resolveEligibleRecipients.mockResolvedValue([{ events: [{ id: 'another-event' }] }]);
    await expect(read()).resolves.toEqual({ status: 'RULES_UNDER_REVIEW' });
  });

  it('never promises a manually selected certificate', async () => {
    const { read, prisma, config, eligibility } = setup();
    prisma.certificateConfig.findMany.mockResolvedValue([{ ...config, issuedTo: 'OTHER' }]);
    await expect(read()).resolves.toEqual({ status: 'RULES_UNDER_REVIEW' });
    expect(eligibility.resolveEligibleRecipients).not.toHaveBeenCalled();
  });

  it('does not describe lecturer eligibility as confirmed attendance', async () => {
    const { read, prisma, config, eligibility } = setup();
    prisma.certificateConfig.findMany.mockResolvedValue([{ ...config, issuedTo: 'LECTURER' }]);
    eligibility.resolveEligibleRecipients.mockResolvedValue([{ events: [{ id: 'event' }] }]);
    await expect(read()).resolves.toEqual({ status: 'AWAITING_RELEASE' });
  });

  it('distinguishes a staged offline record from a confirmed presence', async () => {
    const { read, prisma } = setup();
    prisma.offlineEventAttendanceSubmission.count.mockResolvedValue(1);
    await expect(read()).resolves.toEqual({ status: 'ATTENDANCE_UNDER_REVIEW' });
    expect(prisma.offlineEventAttendanceSubmission.count).toHaveBeenCalledWith({
      where: { personId: 'person', eventId: { in: ['event'] }, status: 'PENDING' },
    });
  });

  it.each([false, true])(
    'distinguishes future participation from missing past attendance (future=%s)',
    async (future) => {
      const { read, prisma, event } = setup();
      event.endDate = new Date(Date.now() + (future ? 1 : -1) * 86_400_000);
      prisma.eventAttendance.findMany.mockResolvedValue([]);
      await expect(read()).resolves.toEqual({ status: future ? 'PARTICIPATION_PENDING' : 'ATTENDANCE_UNCONFIRMED' });
    },
  );

  it.each(['WAITING_RECEIPT_UPLOAD', 'RECEIPT_UNDER_REVIEW', 'CONFIRMED'])(
    'explains payment state %s',
    async (subscriptionStatus) => {
      const { read, prisma, event } = setup();
      event.majorEventId = 'major';
      event.majorEvent = { isPaymentRequired: true };
      prisma.majorEventSubscription.findMany.mockResolvedValue([
        { majorEventId: 'major', subscriptionStatus, selectedEvents: [] },
      ]);
      await expect(read()).resolves.toEqual(
        subscriptionStatus === 'CONFIRMED'
          ? { status: 'RULES_UNDER_REVIEW' }
          : {
              status: subscriptionStatus === 'RECEIPT_UNDER_REVIEW' ? 'PAYMENT_UNDER_REVIEW' : 'PAYMENT_PENDING',
              actionTargetId: 'major',
            },
      );
    },
  );

  it('honors payment exemptions instead of requesting unnecessary payment', async () => {
    const { read, event } = setup();
    event.majorEventId = 'major';
    event.majorEvent = { isPaymentRequired: true };
    event.shouldIssueCertificateForNonPayingAttendees = true;
    await expect(read()).resolves.toEqual({ status: 'RULES_UNDER_REVIEW' });
  });

  it('explains required registration without treating attendance as registration', async () => {
    const { read, event } = setup();
    event.allowSubscription = true;
    await expect(read()).resolves.toEqual({ status: 'REGISTRATION_PENDING' });
  });

  it('does not promise a certificate when configuration is still missing', async () => {
    const { read, prisma } = setup();
    prisma.certificateConfig.findMany.mockResolvedValue([]);
    await expect(read()).resolves.toEqual({ status: 'RULES_UNDER_REVIEW' });
  });

  it('explains that issuance is not offered', async () => {
    const { read, prisma, event } = setup();
    event.shouldIssueCertificate = false;
    prisma.certificateConfig.findMany.mockResolvedValue([]);
    await expect(read()).resolves.toEqual({ status: 'NOT_OFFERED' });
  });

  it('requires authentication and target access before evaluating certificate rules', async () => {
    const { read, publicEvents, prisma } = setup();
    publicEvents.requirePublicEvent.mockRejectedValue(new Error('Not found'));
    await expect(read()).rejects.toThrow('Not found');
    expect(prisma.certificateConfig.findMany).not.toHaveBeenCalled();
  });

  it.each(['REJECTED_NO_SLOTS', 'REJECTED_SCHEDULE_CONFLICT', 'REJECTED_GENERIC', 'CANCELED'])(
    'does not ask someone with registration state %s to pay',
    async (subscriptionStatus) => {
      const { read, prisma, event } = setup();
      event.majorEventId = 'major';
      event.majorEvent = { isPaymentRequired: true };
      prisma.majorEventSubscription.findMany.mockResolvedValue([
        { majorEventId: 'major', subscriptionStatus, selectedEvents: [] },
      ]);
      await expect(read()).resolves.toEqual({ status: 'REGISTRATION_PENDING' });
    },
  );

  it('does not require payment when another certificate activity is free', async () => {
    const { read, prisma, event } = setup();
    prisma.event.findMany.mockResolvedValue([
      event,
      { ...event, id: 'paid', majorEventId: 'major', majorEvent: { isPaymentRequired: true } },
    ]);
    await expect(read()).resolves.toEqual({ status: 'RULES_UNDER_REVIEW' });
  });

  it('explains incomplete attendance for a group that requires every event', async () => {
    const { read, prisma, event, config } = setup();
    prisma.event.findMany.mockResolvedValue([event, { ...event, id: 'missing' }]);
    prisma.certificateConfig.findMany.mockResolvedValue([
      { ...config, scope: 'EVENT_GROUP', eventGroup: { shouldIssuePartialCertificate: false } },
    ]);
    await expect(read(CertificateScope.EVENT_GROUP)).resolves.toEqual({ status: 'GROUP_ATTENDANCE_INCOMPLETE' });
  });

  it('continues past a stale configuration to another valid certificate', async () => {
    const { read, prisma, config, eligibility } = setup();
    prisma.certificateConfig.findMany.mockResolvedValue([config, { ...config, id: 'second' }]);
    eligibility.resolveEligibleRecipients
      .mockRejectedValueOnce(new BadRequestException('Stale config'))
      .mockResolvedValueOnce([{ events: [{ id: 'event' }] }]);
    await expect(read()).resolves.toEqual({ status: 'ATTENDANCE_CONFIRMED' });
  });

  it('allows unpublished ended personal history without opening unrelated targets', async () => {
    const { read, prisma, publicEvents } = setup();
    publicEvents.requirePublicEvent.mockRejectedValue(new NotFoundException());
    await expect(read()).resolves.toEqual({ status: 'RULES_UNDER_REVIEW' });
    expect(prisma.event.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'target',
          deletedAt: null,
          AND: [expect.objectContaining({ endDate: { lte: expect.any(Date) }, OR: expect.any(Array) })],
        }),
      }),
    );
    prisma.event.findFirst.mockResolvedValue(null);
    await expect(read()).rejects.toThrow(NotFoundException);
  });

  it('rejects folders and blank target IDs', async () => {
    const { resolver, read } = setup();
    await expect(read(CertificateScope.OTHER)).rejects.toThrow('Choose an event');
    await expect(
      resolver.currentUserCertificateParticipation({} as never, CertificateScope.EVENT, ' '),
    ).rejects.toThrow('Choose an event');
  });
});
