import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceCategoryService } from '../events/attendance-category.service';
import { EventSubscriptionsResolver } from '../events/subscriptions.resolver';
import { CurrentUserEventSubscriptionService } from '../current-user/events/subscription.service';
import { CurrentUserEventMapperService } from '../current-user/mapper.service';
import { CertificateEligibilityService } from '../certificate/certificate-eligibility.service';
import { CertificateSportsEligibility } from '../certificate/certificate-sports-eligibility';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NovuNotificationsService } from '../notifications/novu-notifications.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { canPersonAnswerLink } from '../event-forms/event-form-eligibility';
import { EventInterestsService } from './interest.service';

const describeDatabase = process.env['PRISMA_MIGRATION_INTEGRATION_TEST'] === '1' ? describe : describe.skip;

describeDatabase('event interest with PostgreSQL and real subscription services', () => {
  const prefix = `interest-integration-${randomUUID()}`;
  const personId = `${prefix}-person`;
  const eventId = `${prefix}-event`;
  const actor = { sub: `${prefix}-actor`, email: 'integration@example.test' } as AuthenticatedUser;
  let prisma: PrismaService;
  let categories: AttendanceCategoryService;
  let interests: EventInterestsService;
  let certificates: CertificateEligibilityService;

  beforeAll(async () => {
    const database = new URL(process.env['DATABASE_URL'] ?? '').pathname;
    if (!database.toLowerCase().includes('test')) throw new Error('This integration suite requires a disposable test database.');
    prisma = new PrismaService();
    await prisma.$connect();
    categories = new AttendanceCategoryService(prisma);
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
    const frozen = {
      assertEventMutable: jest.fn().mockResolvedValue(undefined),
      assertMajorEventMutable: jest.fn().mockResolvedValue(undefined),
      assertEventGroupMutable: jest.fn().mockResolvedValue(undefined),
    } as unknown as FrozenResourceService;
    const notifications = {
      notifyMajorEventSubscriptionRecordChanged: jest.fn().mockResolvedValue(undefined),
    } as unknown as NovuNotificationsService;
    const workspace = new EventSubscriptionsResolver(prisma, categories, notifications, frozen, audit);
    const subscriptions = new CurrentUserEventSubscriptionService(prisma, new CurrentUserEventMapperService(), categories);
    const authorization = { assertPermissions: jest.fn().mockResolvedValue(undefined) } as unknown as AuthorizationPolicyService;
    interests = new EventInterestsService(prisma, authorization, subscriptions, workspace, frozen);
    certificates = new CertificateEligibilityService(
      prisma,
      {} as CertificateSportsEligibility,
      { getEventInvitationFacts: async () => new Map() } as never,
    );
  });

  beforeEach(async () => {
    await clearFixtures();
    const startDate = new Date(Date.now() + 86_400_000);
    await prisma.people.create({ data: { id: personId, name: 'Participante de integração', secondaryEmails: [] } });
    await prisma.event.create({ data: {
      id: eventId, name: 'Evento de integração', startDate,
      endDate: new Date(startDate.getTime() + 3_600_000),
      interestEnabled: true, allowSubscription: true, attendanceEligibility: 'REGISTERED_ONLY',
      subscriptionStartDate: new Date(startDate.getTime() - 3_600_000),
      shouldIssueCertificate: true, shouldCollectAttendance: true, publicationState: 'PUBLISHED',
    } });
  });

  afterAll(async () => {
    if (prisma) {
      await clearFixtures();
      await prisma.$disconnect();
    }
  });

  it('converts an earlier interest after attendance, retaining the independent history and reassessing presence', async () => {
    const interest = await expressInterest();
    expect(interest).not.toBeNull();
    expect(await prisma.eventSubscription.count({ where: { personId } })).toBe(0);
    await prisma.event.update({ where: { id: eventId }, data: {
      startDate: new Date(Date.now() - 7_200_000), endDate: new Date(Date.now() - 3_600_000),
      subscriptionStartDate: null,
    } });
    await prisma.eventAttendance.create({ data: { eventId, personId, createdByMethod: 'MANUAL_INPUT' } });
    await categories.refreshForAttendance(personId, eventId);
    expect((await prisma.eventAttendance.findUniqueOrThrow({ where: { personId_eventId: { personId, eventId } } })).category).toBe('NON_REGULAR');

    await interests.convertInterestToSubscription(actor, { interestId: interest.id });
    expect(await prisma.eventSubscription.count({ where: { personId, eventId, deletedAt: null } })).toBe(1);
    expect(await prisma.eventInterest.count({ where: { personId, eventId, deletedAt: null } })).toBe(1);
    const attendance = await prisma.eventAttendance.findUniqueOrThrow({ where: { personId_eventId: { personId, eventId } } });
    expect(attendance.category).toBe('REGULAR');
    expect(attendance.createdByMethod).toBe('MANUAL_INPUT');
    await interests.convertInterestToSubscription(actor, { interestId: interest.id });
    expect(await prisma.eventSubscription.count({ where: { personId, eventId, deletedAt: null } })).toBe(1);
  });

  it('uses independent certificate criteria and excludes subscribers from interest-only forms', async () => {
    await interests.setCurrentUserInterest(personId, { targetType: 'EVENT', targetId: eventId }, true, actor);
    const link = { eventId, majorEventId: null, audiences: ['INTERESTED'] as const };
    expect(await canPersonAnswerLink(prisma, personId, { ...link, audiences: [...link.audiences] })).toBe(true);
    await prisma.eventAttendance.create({ data: { eventId, personId } });
    await categories.refreshForAttendance(personId, eventId);
    await prisma.certificateTemplate.create({ data: {
      id: `${prefix}-template`, registryKey: `${prefix}-template`, name: 'Modelo de integração',
      htmlTemplate: '<p>Certificado</p>', contentChecksum: prefix,
    } });
    const config = await prisma.certificateConfig.create({ data: {
      id: `${prefix}-config`, name: 'Certificado de integração', scope: 'EVENT', eventId,
      issuedTo: 'ATTENDEE', certificateTemplateId: `${prefix}-template`, attendeeEligibility: 'ANYONE',
    } });
    expect(await certificates.resolveEligibleRecipients(await certificates.getConfigById(config.id))).toHaveLength(1);
    await prisma.event.update({ where: { id: eventId }, data: { attendanceEligibility: 'ANYONE' } });
    await categories.refreshForAttendance(personId, eventId);
    await prisma.certificateConfig.update({ where: { id: config.id }, data: { attendeeEligibility: 'REGISTERED_ONLY' } });
    expect(await certificates.resolveEligibleRecipients(await certificates.getConfigById(config.id))).toHaveLength(0);
    await prisma.eventSubscription.create({ data: { eventId, personId } });
    expect(await certificates.resolveEligibleRecipients(await certificates.getConfigById(config.id))).toHaveLength(1);
    expect(await canPersonAnswerLink(prisma, personId, { ...link, audiences: ['INTERESTED'] })).toBe(false);
    expect(await canPersonAnswerLink(prisma, personId, { ...link, audiences: ['INTERESTED', 'SUBSCRIBERS'] })).toBe(true);
    await expect(interests.setCurrentUserInterest(personId, { targetType: 'EVENT', targetId: eventId }, false, actor)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not manufacture attendance when converting a person who has not attended', async () => {
    const interest = await expressInterest();
    await interests.convertInterestToSubscription(actor, { interestId: interest.id });
    expect(await prisma.eventSubscription.count({ where: { personId, eventId } })).toBe(1);
    expect(await prisma.eventAttendance.count({ where: { personId, eventId } })).toBe(0);
  });

  it('converts a grouped activity after attendance with explicit consent and preserves the group subscription', async () => {
    const eventGroupId = `${prefix}-group`;
    await prisma.eventGroup.create({ data: { id: eventGroupId, name: 'Grupo de integração', requiresImageLicenseAgreement: true } });
    await prisma.event.update({ where: { id: eventId }, data: { eventGroupId } });
    const interest = await expressInterest();
    await prisma.event.update({ where: { id: eventId }, data: {
      startDate: new Date(Date.now() - 7_200_000), endDate: new Date(Date.now() - 3_600_000), subscriptionStartDate: null,
    } });
    await prisma.eventAttendance.create({ data: { eventId, personId, createdByMethod: 'MANUAL_INPUT' } });
    await interests.convertInterestToSubscription(actor, { interestId: interest.id, imageLicenseAgreementAccepted: true });
    const groupSubscription = await prisma.eventGroupSubscription.findFirstOrThrow({ where: { eventGroupId, personId, deletedAt: null } });
    expect(groupSubscription.imageLicenseAgreementAccepted).toBe(true);
    expect((await prisma.eventSubscription.findFirstOrThrow({ where: { eventId, personId, deletedAt: null } })).eventGroupSubscriptionId).toBe(groupSubscription.id);
    expect((await prisma.eventAttendance.findUniqueOrThrow({ where: { personId_eventId: { personId, eventId } } })).category).toBe('REGULAR');
  });

  it('adds an interested activity to an existing major registration without discarding payment or other activities', async () => {
    const majorEventId = await createPaidMajorEvent();
    const previousEventId = `${prefix}-previous-event`;
    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    await prisma.event.create({ data: {
      id: previousEventId, name: 'Atividade anterior', majorEventId,
      startDate: new Date(event.endDate.getTime() + 3_600_000), endDate: new Date(event.endDate.getTime() + 7_200_000),
      allowSubscription: true, publicationState: 'PUBLISHED',
    } });
    const registration = await prisma.majorEventSubscription.create({ data: {
      majorEventId, personId, subscriptionStatus: 'CONFIRMED', amountPaid: 10000, paymentTier: 'Integral',
      selectedEvents: { create: { eventId: previousEventId } },
    } });
    await prisma.eventSubscription.create({ data: { personId, eventId: previousEventId } });
    const interest = await expressInterest();
    await interests.convertInterestToSubscription(actor, { interestId: interest.id });
    const saved = await prisma.majorEventSubscription.findUniqueOrThrow({ where: { id: registration.id }, include: { selectedEvents: { where: { deletedAt: null } } } });
    expect(saved.subscriptionStatus).toBe('CONFIRMED');
    expect(saved.amountPaid).toBe(10000);
    expect(saved.paymentTier).toBe('Integral');
    expect(new Set(saved.selectedEvents.map((selection) => selection.eventId))).toEqual(new Set([previousEventId, eventId]));
    expect(await prisma.eventSubscription.count({ where: { personId, eventId, deletedAt: null } })).toBe(1);
  });

  it('creates paid conversions pending approval while distinguishing registered and approved attendance', async () => {
    const majorEventId = await createPaidMajorEvent();
    const interest = await expressInterest();
    await interests.convertInterestToSubscription(actor, { interestId: interest.id, selectedEventIds: [eventId] });
    const registration = await prisma.majorEventSubscription.findFirstOrThrow({ where: { personId, majorEventId, deletedAt: null } });
    expect(registration.subscriptionStatus).toBe('WAITING_RECEIPT_UPLOAD');
    expect(await prisma.eventSubscription.count({ where: { personId, eventId, deletedAt: null } })).toBe(0);
    expect(await canPersonAnswerLink(prisma, personId, { eventId, majorEventId: null, audiences: ['INTERESTED'] })).toBe(false);
    expect(await canPersonAnswerLink(prisma, personId, { eventId, majorEventId: null, audiences: ['SUBSCRIBERS'] })).toBe(true);
    await prisma.eventAttendance.create({ data: { personId, eventId } });
    await categories.refreshForAttendance(personId, eventId);
    expect((await prisma.eventAttendance.findUniqueOrThrow({ where: { personId_eventId: { personId, eventId } } })).category).toBe('REGULAR');
    await prisma.event.update({ where: { id: eventId }, data: { attendanceEligibility: 'APPROVED_REGISTRATIONS_ONLY' } });
    await categories.refreshForAttendance(personId, eventId);
    expect((await prisma.eventAttendance.findUniqueOrThrow({ where: { personId_eventId: { personId, eventId } } })).category).toBe('NON_REGULAR');
  });

  it.each(['CANCELED', 'REJECTED_INVALID_RECEIPT'] as const)('converts interest after a %s registration without implicitly approving payment', async (subscriptionStatus) => {
    const majorEventId = await createPaidMajorEvent();
    const previous = await prisma.majorEventSubscription.create({ data: {
      majorEventId, personId, subscriptionStatus, selectedEvents: { create: { eventId } },
    } });
    const interest = await expressInterest();
    await interests.convertInterestToSubscription(actor, { interestId: interest.id });
    const registration = await prisma.majorEventSubscription.findUniqueOrThrow({ where: { id: previous.id } });
    expect(registration.subscriptionStatus).toBe('WAITING_RECEIPT_UPLOAD');
    expect(await prisma.majorEventSubscription.count({ where: { personId, majorEventId, deletedAt: null } })).toBe(1);
    expect(await prisma.eventInterest.count({ where: { personId, eventId, deletedAt: null } })).toBe(1);
  });

  async function expressInterest() {
    const interest = await interests.setCurrentUserInterest(personId, { targetType: 'EVENT', targetId: eventId }, true, actor);
    if (!interest) throw new Error('Expected the interest to be stored.');
    return interest;
  }

  async function createPaidMajorEvent(): Promise<string> {
    const majorEventId = `${prefix}-major`;
    await prisma.majorEvent.create({ data: {
      id: majorEventId, name: 'Grande evento pago', isPaymentRequired: true, interestEnabled: true,
      startDate: new Date(Date.now() - 86_400_000), endDate: new Date(Date.now() + 3 * 86_400_000), publicationState: 'PUBLISHED',
      majorEventPrices: { create: { type: 'SINGLE', tiers: { create: { name: 'Integral', value: 10000 } } } },
    } });
    await prisma.event.update({ where: { id: eventId }, data: { majorEventId } });
    return majorEventId;
  }

  async function clearFixtures() {
    await prisma.certificateConfig.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.certificateTemplate.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.eventAttendance.deleteMany({ where: { personId } });
    await prisma.eventInterest.deleteMany({ where: { personId } });
    await prisma.majorEventSubscriptionEventSelection.deleteMany({ where: { subscription: { personId } } });
    await prisma.eventSubscription.deleteMany({ where: { personId } });
    await prisma.eventGroupSubscription.deleteMany({ where: { personId } });
    await prisma.majorEventSubscription.deleteMany({ where: { personId } });
    await prisma.event.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.eventGroup.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.priceTier.deleteMany({ where: { price: { majorEventId: { startsWith: prefix } } } });
    await prisma.majorEventPrice.deleteMany({ where: { majorEventId: { startsWith: prefix } } });
    await prisma.majorEvent.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.people.deleteMany({ where: { id: personId } });
  }
});
