import {
  PersonLinkedDataSummary,
  PersonLinkedResource,
  PersonLinkedResourcePage,
} from '@cacic-fct/shared-data-types';
import { NotFoundException } from '@nestjs/common';
import { resolvePagination } from '../common/pagination';
import {
  getCertificateRoute,
  getCertificateTargetLabel,
  getLinkedResourceGroupDefinition,
  getPermissionGrantTargetLabel,
  PERSON_LINKED_RESOURCE_GROUPS,
  PersonLinkedResourcePrisma,
} from './people-linked-resource-definitions';
import { countPersonLinkedResourceGroups } from './people-linked-resource-counts';

export { personHasLinkedData } from './people-linked-resource-counts';

export async function buildPersonLinkedDataSummary(
  prisma: PersonLinkedResourcePrisma,
  personId: string,
  hasDeletePermission: boolean,
): Promise<PersonLinkedDataSummary> {
  const counts = await countPersonLinkedResourceGroups(prisma, personId);
  const groups = PERSON_LINKED_RESOURCE_GROUPS.map((definition) => ({
    ...definition,
    items: [],
    totalCount: counts[definition.type] ?? 0,
  })).filter((group) => group.totalCount > 0);
  const totalCount = groups.reduce((sum, group) => sum + group.totalCount, 0);

  return {
    personId,
    groups,
    totalCount,
    hasLinkedData: totalCount > 0,
    canDelete: hasDeletePermission && totalCount === 0,
  };
}

export async function buildPersonLinkedResourcePage(
  prisma: PersonLinkedResourcePrisma,
  personId: string,
  type: string,
  skip?: number,
  take?: number,
): Promise<PersonLinkedResourcePage> {
  const definition = getLinkedResourceGroupDefinition(type);
  const pagination = resolvePagination(skip, take);
  const page = await buildRequestedLinkedResourcePage(prisma, personId, definition.type, pagination.skip, pagination.take);

  return {
    personId,
    type: definition.type,
    label: definition.label,
    icon: definition.icon,
    items: page.items,
    total: page.total,
    skip: pagination.skip,
    take: pagination.take,
  };
}

async function buildRequestedLinkedResourcePage(
  prisma: PersonLinkedResourcePrisma,
  personId: string,
  type: string,
  skip: number,
  take: number,
): Promise<{ items: PersonLinkedResource[]; total: number }> {
  const person = await prisma.people.findFirst({
    where: { id: personId, deletedAt: null },
    select: {
      id: true,
      userId: true,
      user: { select: { id: true, email: true, name: true, updatedAt: true } },
      mergedInto: { select: { id: true, name: true } },
    },
  });
  if (!person) {
    throw new NotFoundException(`Person ${personId} was not found.`);
  }

  switch (type) {
    case 'USER':
      return {
        total: person.userId ? 1 : 0,
        items: person.user && skip === 0 && take > 0
          ? [{
              id: person.user.id,
              label: person.user.name,
              description: person.user.email,
              route: `/people/${person.id}`,
              occurredAt: person.user.updatedAt,
            }]
          : [],
      };
    case 'CERTIFICATE': {
      const [total, certificates] = await Promise.all([
        prisma.certificate.count({ where: { personId, deletedAt: null } }),
        prisma.certificate.findMany({
          where: { personId, deletedAt: null },
          include: {
            config: {
              select: {
                id: true,
                name: true,
                scope: true,
                eventId: true,
                eventGroupId: true,
                majorEventId: true,
                event: { select: { id: true, name: true } },
                eventGroup: { select: { id: true, name: true } },
                majorEvent: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { issuedAt: 'desc' },
          skip,
          take,
        }),
      ]);
      return {
        total,
        items: certificates.map((certificate) => ({
          id: certificate.id,
          label: certificate.config.name,
          description: getCertificateTargetLabel(certificate.config),
          route: getCertificateRoute(certificate.config),
          occurredAt: certificate.issuedAt,
        })),
      };
    }
    case 'SUBSCRIPTION':
      return buildSegmentedPage(skip, take, [
        {
          count: () => prisma.eventSubscription.count({ where: { personId, deletedAt: null } }),
          find: (segment) => prisma.eventSubscription.findMany({
            where: { personId, deletedAt: null },
            include: { event: { select: { id: true, name: true, startDate: true } } },
            orderBy: { createdAt: 'desc' },
            ...segment,
          }).then((subscriptions) => subscriptions.map((subscription) => ({
            id: subscription.id,
            label: subscription.event.name,
            description: 'Inscrição em evento',
            route: `/subscriptions/event/${subscription.eventId}`,
            occurredAt: subscription.createdAt,
          }))),
        },
        {
          count: () => prisma.eventGroupSubscription.count({ where: { personId, deletedAt: null } }),
          find: (segment) => prisma.eventGroupSubscription.findMany({
            where: { personId, deletedAt: null },
            include: { eventGroup: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' },
            ...segment,
          }).then((subscriptions) => subscriptions.map((subscription) => ({
            id: subscription.id,
            label: subscription.eventGroup.name,
            description: 'Inscrição em grupo de eventos',
            route: `/groups/${subscription.eventGroupId}`,
            occurredAt: subscription.createdAt,
          }))),
        },
        {
          count: () => prisma.majorEventSubscription.count({ where: { personId, deletedAt: null } }),
          find: (segment) => prisma.majorEventSubscription.findMany({
            where: { personId, deletedAt: null },
            include: { majorEvent: { select: { id: true, name: true, startDate: true } } },
            orderBy: { updatedAt: 'desc' },
            ...segment,
          }).then((subscriptions) => subscriptions.map((subscription) => ({
            id: subscription.id,
            label: subscription.majorEvent.name,
            description: 'Inscrição em grande evento',
            route: `/subscriptions/major-event/${subscription.majorEventId}`,
            status: subscription.subscriptionStatus,
            occurredAt: subscription.updatedAt,
          }))),
        },
      ]);
    case 'ATTENDANCE': {
      const [total, attendances] = await Promise.all([
        prisma.eventAttendance.count({ where: { personId } }),
        prisma.eventAttendance.findMany({
          where: { personId },
          include: { event: { select: { id: true, name: true, startDate: true } } },
          orderBy: { attendedAt: 'desc' },
          skip,
          take,
        }),
      ]);
      return {
        total,
        items: attendances.map((attendance) => ({
          id: `${attendance.personId}:${attendance.eventId}`,
          label: attendance.event.name,
          description: 'Presença em evento',
          route: `/attendances/event/${attendance.eventId}`,
          status: attendance.category,
          occurredAt: attendance.attendedAt,
        })),
      };
    }
    case 'EVENT_RELATION':
      return buildSegmentedPage(skip, take, [
        {
          count: () => prisma.eventLecturer.count({ where: { personId } }),
          find: (segment) => prisma.eventLecturer.findMany({
            where: { personId },
            include: { event: { select: { id: true, name: true, startDate: true } } },
            orderBy: { createdAt: 'desc' },
            ...segment,
          }).then((lectures) => lectures.map((lecture) => ({
            id: `${lecture.eventId}:${lecture.personId}:lecturer`,
            label: lecture.event.name,
            description: 'Ministrante',
            route: `/events/${lecture.eventId}`,
            occurredAt: lecture.createdAt,
          }))),
        },
        {
          count: () => prisma.eventAttendanceCollector.count({ where: { personId } }),
          find: (segment) => prisma.eventAttendanceCollector.findMany({
            where: { personId },
            include: { event: { select: { id: true, name: true, startDate: true } } },
            orderBy: { createdAt: 'desc' },
            ...segment,
          }).then((collectors) => collectors.map((collector) => ({
            id: `${collector.eventId}:${collector.personId}:collector`,
            label: collector.event.name,
            description: 'Coletor de presença',
            route: `/events/${collector.eventId}`,
            occurredAt: collector.createdAt,
          }))),
        },
      ]);
    case 'OFFLINE_ATTENDANCE_SUBMISSION': {
      const [total, submissions] = await Promise.all([
        prisma.offlineEventAttendanceSubmission.count({ where: { personId } }),
        prisma.offlineEventAttendanceSubmission.findMany({
          where: { personId },
          include: { event: { select: { id: true, name: true, startDate: true } } },
          orderBy: { submittedAt: 'desc' },
          skip,
          take,
        }),
      ]);
      return {
        total,
        items: submissions.map((submission) => ({
          id: submission.id,
          label: submission.event.name,
          description: 'Submissão offline de presença',
          route: `/attendances/event/${submission.eventId}`,
          status: submission.status,
          occurredAt: submission.submittedAt,
        })),
      };
    }
    case 'RECEIPT': {
      const [total, receipts] = await Promise.all([
        prisma.majorEventReceipt.count({ where: { personId } }),
        prisma.majorEventReceipt.findMany({
          where: { personId },
          include: { subscription: { select: { majorEventId: true } } },
          orderBy: { uploadedAt: 'desc' },
          skip,
          take,
        }),
      ]);
      return {
        total,
        items: receipts.map((receipt) => ({
          id: receipt.id,
          label: receipt.fileName,
          description: 'Comprovante de inscrição em grande evento',
          route: `/subscriptions/major-event/${receipt.subscription.majorEventId}/validate-receipts`,
          status: receipt.processingStatus,
          occurredAt: receipt.uploadedAt,
        })),
      };
    }
    case 'LECTURER_PROFILE': {
      const lecturerProfile = await prisma.lecturerProfile.findUnique({
        where: { personId },
        select: { id: true, displayName: true, updatedAt: true },
      });
      return {
        total: lecturerProfile ? 1 : 0,
        items: lecturerProfile && skip === 0 && take > 0
          ? [{
              id: lecturerProfile.id,
              label: lecturerProfile.displayName,
              description: 'Perfil público de ministrante',
              route: `/people/${person.id}`,
              occurredAt: lecturerProfile.updatedAt,
            }]
          : [],
      };
    }
    case 'PERMISSION_GRANT': {
      const [total, grants] = await Promise.all([
        prisma.eventManagerPermissionGrant.count({ where: { personId, deletedAt: null } }),
        prisma.eventManagerPermissionGrant.findMany({
          where: { personId, deletedAt: null },
          include: {
            event: { select: { id: true, name: true } },
            eventGroup: { select: { id: true, name: true } },
            majorEvent: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
      ]);
      return {
        total,
        items: grants.map((grant) => ({
          id: grant.id,
          label: grant.permission,
          description: getPermissionGrantTargetLabel(grant),
          route: `/people/${person.id}`,
          status: grant.scope,
          occurredAt: grant.createdAt,
        })),
      };
    }
    case 'MERGE':
      return buildSegmentedPage(skip, take, [
        {
          count: async () => person.mergedInto ? 1 : 0,
          find: async (segment) => person.mergedInto && segment.skip === 0 && segment.take > 0
            ? [{
                id: `${person.id}:merged-into:${person.mergedInto.id}`,
                label: `Unificada em ${person.mergedInto.name}`,
                description: 'Esta pessoa aponta para outro cadastro',
                route: `/people/${person.mergedInto.id}`,
              }]
            : [],
        },
        {
          count: () => prisma.people.count({ where: { mergedIntoId: personId, deletedAt: null } }),
          find: (segment) => prisma.people.findMany({
            where: { mergedIntoId: personId, deletedAt: null },
            select: { id: true, name: true, updatedAt: true },
            orderBy: { updatedAt: 'desc' },
            ...segment,
          }).then((people) => people.map((mergedPerson) => ({
            id: `${mergedPerson.id}:merged-from:${person.id}`,
            label: `${mergedPerson.name} foi unificada neste cadastro`,
            description: 'Outro cadastro aponta para esta pessoa',
            route: `/people/${mergedPerson.id}`,
            occurredAt: mergedPerson.updatedAt,
          }))),
        },
        {
          count: () => prisma.mergeCandidate.count({ where: { OR: [{ personAId: personId }, { personBId: personId }] } }),
          find: (segment) => prisma.mergeCandidate.findMany({
            where: { OR: [{ personAId: personId }, { personBId: personId }] },
            orderBy: { updatedAt: 'desc' },
            ...segment,
          }).then((candidates) => candidates.map((candidate) => ({
            id: candidate.id,
            label: `Candidato de unificação ${candidate.status.toLocaleLowerCase('pt-BR')}`,
            description: candidate.matchValue ?? candidate.matchMethod ?? 'Candidato de unificação',
            route: '/merge-candidates',
            status: candidate.status,
            occurredAt: candidate.updatedAt,
          }))),
        },
        {
          count: () => prisma.peopleMergeOperation.count({ where: { targetPersonId: personId } }),
          find: (segment) => prisma.peopleMergeOperation.findMany({
            where: { targetPersonId: personId },
            orderBy: { createdAt: 'desc' },
            ...segment,
          }).then((operations) => operations.map((operation) => ({
            id: `${operation.id}:target`,
            label: 'Operação de unificação como destino',
            description: operation.status,
            route: '/merge-candidates',
            status: operation.status,
            occurredAt: operation.createdAt,
          }))),
        },
        {
          count: () => prisma.peopleMergeOperation.count({ where: { sourcePersonId: personId } }),
          find: (segment) => prisma.peopleMergeOperation.findMany({
            where: { sourcePersonId: personId },
            orderBy: { createdAt: 'desc' },
            ...segment,
          }).then((operations) => operations.map((operation) => ({
            id: `${operation.id}:source`,
            label: 'Operação de unificação como origem',
            description: operation.status,
            route: '/merge-candidates',
            status: operation.status,
            occurredAt: operation.createdAt,
          }))),
        },
      ]);
    default:
      return { items: [], total: 0 };
  }
}

async function buildSegmentedPage(
  skip: number,
  take: number,
  segments: Array<{
    count: () => Promise<number>;
    find: (pagination: { skip: number; take: number }) => Promise<PersonLinkedResource[]>;
  }>,
): Promise<{ items: PersonLinkedResource[]; total: number }> {
  const counts = await Promise.all(segments.map((segment) => segment.count()));
  const total = counts.reduce((sum, count) => sum + count, 0);
  const items: PersonLinkedResource[] = [];
  let remainingSkip = skip;
  let remainingTake = take;

  for (const [index, segment] of segments.entries()) {
    const count = counts[index];
    if (remainingSkip >= count) {
      remainingSkip -= count;
      continue;
    }
    if (remainingTake <= 0) {
      break;
    }

    const segmentTake = Math.min(remainingTake, count - remainingSkip);
    items.push(...await segment.find({ skip: remainingSkip, take: segmentTake }));
    remainingTake -= segmentTake;
    remainingSkip = 0;
  }

  return { items, total };
}
