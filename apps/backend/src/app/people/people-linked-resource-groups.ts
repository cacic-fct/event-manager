import { PersonLinkedResourceGroup } from '@cacic-fct/shared-data-types';
import { NotFoundException } from '@nestjs/common';
import {
  buildLinkedGroup,
  getCertificateRoute,
  getCertificateTargetLabel,
  getPermissionGrantTargetLabel,
  normalizeLinkedResourceGroups,
  PersonLinkedResourcePrisma,
} from './people-linked-resource-definitions';

export async function buildPersonLinkedResourceGroups(
  prisma: PersonLinkedResourcePrisma,
  personId: string,
): Promise<PersonLinkedResourceGroup[]> {
  const person = await prisma.people.findFirst({
    where: { id: personId, deletedAt: null },
    select: {
      id: true,
      name: true,
      userId: true,
      mergedIntoId: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          updatedAt: true,
        },
      },
      mergedInto: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!person) {
    throw new NotFoundException(`Person ${personId} was not found.`);
  }

  const [
    certificates,
    eventSubscriptions,
    eventGroupSubscriptions,
    majorEventSubscriptions,
    attendances,
    lectures,
    attendanceCollectors,
    offlineAttendanceSubmissions,
    permissionGrants,
    lecturerProfile,
    mergedFrom,
    mergeCandidates,
    mergeOperationsAsTarget,
    mergeOperationsAsSource,
    receipts,
  ] = await Promise.all([
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
    }),
    prisma.eventSubscription.findMany({
      where: { personId, deletedAt: null },
      include: { event: { select: { id: true, name: true, startDate: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.eventGroupSubscription.findMany({
      where: { personId, deletedAt: null },
      include: { eventGroup: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.majorEventSubscription.findMany({
      where: { personId, deletedAt: null },
      include: { majorEvent: { select: { id: true, name: true, startDate: true } } },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.eventAttendance.findMany({
      where: { personId },
      include: { event: { select: { id: true, name: true, startDate: true } } },
      orderBy: { attendedAt: 'desc' },
    }),
    prisma.eventLecturer.findMany({
      where: { personId },
      include: { event: { select: { id: true, name: true, startDate: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.eventAttendanceCollector.findMany({
      where: { personId },
      include: { event: { select: { id: true, name: true, startDate: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.offlineEventAttendanceSubmission.findMany({
      where: { personId },
      include: { event: { select: { id: true, name: true, startDate: true } } },
      orderBy: { submittedAt: 'desc' },
    }),
    prisma.eventManagerPermissionGrant.findMany({
      where: { personId, deletedAt: null },
      include: {
        event: { select: { id: true, name: true } },
        eventGroup: { select: { id: true, name: true } },
        majorEvent: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.lecturerProfile.findUnique({
      where: { personId },
      select: { id: true, displayName: true, updatedAt: true },
    }),
    prisma.people.findMany({
      where: { mergedIntoId: personId, deletedAt: null },
      select: { id: true, name: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.mergeCandidate.findMany({
      where: { OR: [{ personAId: personId }, { personBId: personId }] },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.peopleMergeOperation.findMany({
      where: { targetPersonId: personId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.peopleMergeOperation.findMany({
      where: { sourcePersonId: personId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.majorEventReceipt.findMany({
      where: { personId },
      include: { subscription: { select: { majorEventId: true } } },
      orderBy: { uploadedAt: 'desc' },
    }),
  ]);

  return normalizeLinkedResourceGroups([
    buildLinkedGroup('USER', 'Usuário vinculado', 'account_circle', [
      ...(person.user
        ? [
            {
              id: person.user.id,
              label: person.user.name,
              description: person.user.email,
              route: `/people/${person.id}`,
              occurredAt: person.user.updatedAt,
            },
          ]
        : []),
    ]),
    buildLinkedGroup(
      'CERTIFICATE',
      'Certificados',
      'workspace_premium',
      certificates.map((certificate) => ({
        id: certificate.id,
        label: certificate.config.name,
        description: getCertificateTargetLabel(certificate.config),
        route: getCertificateRoute(certificate.config),
        occurredAt: certificate.issuedAt,
      })),
    ),
    buildLinkedGroup(
      'SUBSCRIPTION',
      'Inscrições',
      'confirmation_number',
      [
        ...eventSubscriptions.map((subscription) => ({
          id: subscription.id,
          label: subscription.event.name,
          description: 'Inscrição em evento',
          route: `/subscriptions/event/${subscription.eventId}`,
          occurredAt: subscription.createdAt,
        })),
        ...eventGroupSubscriptions.map((subscription) => ({
          id: subscription.id,
          label: subscription.eventGroup.name,
          description: 'Inscrição em grupo de eventos',
          route: `/groups/${subscription.eventGroupId}`,
          occurredAt: subscription.createdAt,
        })),
        ...majorEventSubscriptions.map((subscription) => ({
          id: subscription.id,
          label: subscription.majorEvent.name,
          description: 'Inscrição em grande evento',
          route: `/subscriptions/major-event/${subscription.majorEventId}`,
          status: subscription.subscriptionStatus,
          occurredAt: subscription.updatedAt,
        })),
      ],
    ),
    buildLinkedGroup(
      'ATTENDANCE',
      'Presenças',
      'how_to_reg',
      attendances.map((attendance) => ({
        id: `${attendance.personId}:${attendance.eventId}`,
        label: attendance.event.name,
        description: 'Presença em evento',
        route: `/attendances/event/${attendance.eventId}`,
        status: attendance.category,
        occurredAt: attendance.attendedAt,
      })),
    ),
    buildLinkedGroup(
      'EVENT_RELATION',
      'Vínculos com eventos',
      'event_available',
      [
        ...lectures.map((lecture) => ({
          id: `${lecture.eventId}:${lecture.personId}:lecturer`,
          label: lecture.event.name,
          description: 'Ministrante',
          route: `/events/${lecture.eventId}`,
          occurredAt: lecture.createdAt,
        })),
        ...attendanceCollectors.map((collector) => ({
          id: `${collector.eventId}:${collector.personId}:collector`,
          label: collector.event.name,
          description: 'Coletor de presença',
          route: `/events/${collector.eventId}`,
          occurredAt: collector.createdAt,
        })),
      ],
    ),
    buildLinkedGroup(
      'OFFLINE_ATTENDANCE_SUBMISSION',
      'Coletas offline',
      'sync_problem',
      offlineAttendanceSubmissions.map((submission) => ({
        id: submission.id,
        label: submission.event.name,
        description: 'Submissão offline de presença',
        route: `/attendances/event/${submission.eventId}`,
        status: submission.status,
        occurredAt: submission.submittedAt,
      })),
    ),
    buildLinkedGroup(
      'RECEIPT',
      'Comprovantes',
      'receipt_long',
      receipts.map((receipt) => ({
        id: receipt.id,
        label: receipt.fileName,
        description: 'Comprovante de inscrição em grande evento',
        route: `/subscriptions/major-event/${receipt.subscription.majorEventId}/validate-receipts`,
        status: receipt.processingStatus,
        occurredAt: receipt.uploadedAt,
      })),
    ),
    buildLinkedGroup(
      'LECTURER_PROFILE',
      'Perfil de ministrante',
      'badge',
      lecturerProfile
        ? [
            {
              id: lecturerProfile.id,
              label: lecturerProfile.displayName,
              description: 'Perfil público de ministrante',
              route: `/people/${person.id}`,
              occurredAt: lecturerProfile.updatedAt,
            },
          ]
        : [],
    ),
    buildLinkedGroup(
      'PERMISSION_GRANT',
      'Permissões',
      'admin_panel_settings',
      permissionGrants.map((grant) => ({
        id: grant.id,
        label: grant.permission,
        description: getPermissionGrantTargetLabel(grant),
        route: `/people/${person.id}`,
        status: grant.scope,
        occurredAt: grant.createdAt,
      })),
    ),
    buildLinkedGroup(
      'MERGE',
      'Unificações',
      'call_merge',
      [
        ...(person.mergedInto
          ? [
              {
                id: `${person.id}:merged-into:${person.mergedInto.id}`,
                label: `Unificada em ${person.mergedInto.name}`,
                description: 'Esta pessoa aponta para outro cadastro',
                route: `/people/${person.mergedInto.id}`,
              },
            ]
          : []),
        ...mergedFrom.map((mergedPerson) => ({
          id: `${mergedPerson.id}:merged-from:${person.id}`,
          label: `${mergedPerson.name} foi unificada neste cadastro`,
          description: 'Outro cadastro aponta para esta pessoa',
          route: `/people/${mergedPerson.id}`,
          occurredAt: mergedPerson.updatedAt,
        })),
        ...mergeCandidates.map((candidate) => ({
          id: candidate.id,
          label: `Candidato de unificação ${candidate.status.toLocaleLowerCase('pt-BR')}`,
          description: candidate.matchValue ?? candidate.matchMethod ?? 'Candidato de unificação',
          route: '/merge-candidates',
          status: candidate.status,
          occurredAt: candidate.updatedAt,
        })),
        ...mergeOperationsAsTarget.map((operation) => ({
          id: `${operation.id}:target`,
          label: 'Operação de unificação como destino',
          description: operation.status,
          route: '/merge-candidates',
          status: operation.status,
          occurredAt: operation.createdAt,
        })),
        ...mergeOperationsAsSource.map((operation) => ({
          id: `${operation.id}:source`,
          label: 'Operação de unificação como origem',
          description: operation.status,
          route: '/merge-candidates',
          status: operation.status,
          occurredAt: operation.createdAt,
        })),
      ],
    ),
  ]);
}
