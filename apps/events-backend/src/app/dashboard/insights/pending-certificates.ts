import { PrismaService } from '../../prisma/prisma.service';
import { DashboardCertificatePendingItem } from '../models';

export async function buildPendingCertificates(
  prisma: PrismaService,
  now: Date,
): Promise<DashboardCertificatePendingItem[]> {
  const [events, eventGroups, majorEvents, lecturerCertificateEvents, majorEventsWithLecturers] = await Promise.all([
    prisma.event.findMany({
      where: {
        deletedAt: null,
        endDate: { lt: now },
        majorEventId: null,
        OR: [
          { shouldIssueCertificate: true },
          {
            certificateConfigs: {
              some: { deletedAt: null, isActive: true },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        endDate: true,
        eventGroup: {
          select: {
            shouldIssueCertificate: true,
            certificateConfigs: {
              where: { deletedAt: null, isActive: true },
              select: { id: true },
            },
          },
        },
        certificateConfigs: {
          where: { deletedAt: null, isActive: true },
          select: {
            id: true,
            certificates: {
              where: { deletedAt: null },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { endDate: 'desc' },
      take: 20,
    }),
    prisma.eventGroup.findMany({
      where: {
        deletedAt: null,
        OR: [
          { shouldIssueCertificate: true },
          {
            certificateConfigs: {
              some: { deletedAt: null, isActive: true },
            },
          },
        ],
        events: {
          some: { deletedAt: null, endDate: { lt: now } },
          every: {
            OR: [{ majorEventId: null }, { deletedAt: { not: null } }],
          },
        },
      },
      select: {
        id: true,
        name: true,
        shouldIssueCertificate: true,
        events: {
          where: { deletedAt: null },
          select: { endDate: true },
          orderBy: { endDate: 'desc' },
          take: 1,
        },
        certificateConfigs: {
          where: { deletedAt: null, isActive: true },
          select: {
            id: true,
            certificates: {
              where: { deletedAt: null },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    }),
    prisma.majorEvent.findMany({
      where: {
        deletedAt: null,
        endDate: { lt: now },
        certificateConfigs: { some: { deletedAt: null, isActive: true } },
      },
      select: {
        id: true,
        name: true,
        endDate: true,
        certificateConfigs: {
          where: { deletedAt: null, isActive: true },
          select: {
            id: true,
            certificates: {
              where: { deletedAt: null },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { endDate: 'desc' },
      take: 20,
    }),
    prisma.event.findMany({
      where: {
        deletedAt: null,
        endDate: { lt: now },
        lecturers: { some: { person: { deletedAt: null } } },
        certificateConfigs: {
          some: {
            deletedAt: null,
            isActive: true,
            issuedTo: 'LECTURER',
          },
        },
      },
      select: {
        id: true,
        name: true,
        endDate: true,
        lecturers: {
          where: { person: { deletedAt: null } },
          select: { personId: true },
        },
        certificateConfigs: {
          where: {
            deletedAt: null,
            isActive: true,
            issuedTo: 'LECTURER',
          },
          select: {
            id: true,
            certificates: {
              where: { deletedAt: null },
              select: { personId: true },
            },
          },
        },
      },
      orderBy: { endDate: 'desc' },
      take: 20,
    }),
    prisma.majorEvent.findMany({
      where: {
        deletedAt: null,
        endDate: { lt: now },
        events: {
          some: {
            deletedAt: null,
            lecturers: { some: {} },
          },
        },
        certificateConfigs: {
          some: {
            deletedAt: null,
            isActive: true,
            issuedTo: 'LECTURER',
          },
        },
      },
      select: {
        id: true,
        name: true,
        endDate: true,
        certificateConfigs: {
          where: {
            deletedAt: null,
            isActive: true,
            issuedTo: 'LECTURER',
          },
          select: {
            id: true,
            certificates: {
              where: { deletedAt: null },
              select: { personId: true },
            },
          },
        },
        events: {
          where: {
            deletedAt: null,
            shouldIssueCertificate: true,
            lecturers: { some: { person: { deletedAt: null } } },
          },
          select: {
            lecturers: {
              where: { person: { deletedAt: null } },
              select: { personId: true },
            },
          },
        },
      },
      orderBy: { endDate: 'desc' },
      take: 20,
    }),
  ]);

  const pending: DashboardCertificatePendingItem[] = [];
  for (const event of events) {
    const groupIssuesCertificate =
      event.eventGroup?.shouldIssueCertificate || Boolean(event.eventGroup?.certificateConfigs.length);
    if (!groupIssuesCertificate && hasMissingCertificatesOrConfig(event)) {
      pending.push({
        targetType: 'EVENT',
        targetId: event.id,
        title: event.name,
        subtitle: 'Evento finalizado sem certificados emitidos.',
        finishedAt: event.endDate,
      });
    }
  }

  for (const group of eventGroups) {
    if (hasMissingCertificatesOrConfig(group) && group.events[0]) {
      pending.push({
        targetType: 'EVENT_GROUP',
        targetId: group.id,
        title: group.name,
        subtitle: 'Grupo finalizado sem certificados emitidos.',
        finishedAt: group.events[0].endDate,
      });
    }
  }

  for (const majorEvent of majorEvents) {
    if (hasConfigWithoutCertificate(majorEvent)) {
      pending.push({
        targetType: 'MAJOR_EVENT',
        targetId: majorEvent.id,
        title: majorEvent.name,
        subtitle: 'Grande evento finalizado sem certificados emitidos.',
        finishedAt: majorEvent.endDate,
      });
    }
  }

  for (const event of lecturerCertificateEvents) {
    if (hasMissingLecturerCertificates(event)) {
      pending.push({
        targetType: 'EVENT',
        targetId: event.id,
        title: event.name,
        subtitle: 'Há palestrantes cadastrados no evento sem certificados emitidos.',
        finishedAt: event.endDate,
      });
    }
  }

  for (const majorEvent of majorEventsWithLecturers) {
    if (
      hasMissingLecturerCertificates({
        lecturers: majorEvent.events.flatMap((event) => event.lecturers),
        certificateConfigs: majorEvent.certificateConfigs,
      })
    ) {
      pending.push({
        targetType: 'MAJOR_EVENT_LECTURERS',
        targetId: majorEvent.id,
        title: majorEvent.name,
        subtitle: 'Há palestrantes cadastrados no grande evento sem certificados emitidos.',
        finishedAt: majorEvent.endDate,
      });
    }
  }

  return pending.sort((left, right) => right.finishedAt.getTime() - left.finishedAt.getTime()).slice(0, 12);
}

function hasConfigWithoutCertificate(target: { certificateConfigs: { certificates: { id: string }[] }[] }): boolean {
  return target.certificateConfigs.some((config) => config.certificates.length === 0);
}

function hasMissingCertificatesOrConfig(target: {
  shouldIssueCertificate?: boolean;
  certificateConfigs: { certificates: { id: string }[] }[];
}): boolean {
  return (
    (target.shouldIssueCertificate && target.certificateConfigs.length === 0) ||
    hasConfigWithoutCertificate(target)
  );
}

function hasMissingLecturerCertificates(target: {
  lecturers: { personId: string }[];
  certificateConfigs: { certificates: { personId: string }[] }[];
}): boolean {
  const lecturerIds = new Set(target.lecturers.map((lecturer) => lecturer.personId));

  if (lecturerIds.size === 0) {
    return false;
  }

  return target.certificateConfigs.some((config) => {
    const issuedPersonIds = new Set(config.certificates.map((certificate) => certificate.personId));

    return [...lecturerIds].some((lecturerId) => !issuedPersonIds.has(lecturerId));
  });
}
