import { ForbiddenException } from '@nestjs/common';
import { AttendanceCreationMethod } from '@prisma/client';
import { addHours, isWithinInterval, subHours } from 'date-fns';
import { CurrentUserAttendanceCollectionResolver } from './attendance-collection.resolver';

export type OfflineSubmissionCreateInput = {
  clientId: string;
  eventId: string;
  personId?: string | null;
  createdByMethod: AttendanceCreationMethod;
  scannerCode?: string | null;
  manualValue?: string | null;
  collectedAt: Date;
  authorUserId?: string | null;
  authorName?: string | null;
  authorEmail?: string | null;
  submittedById: string;
  stagedReason?: string | null;
  resolutionError?: string | null;
  collectedLatitude?: number | null;
  collectedLongitude?: number | null;
  collectedAccuracyMeters?: number | null;
};

export type OfflineSubmissionRecord = {
  id: string;
  clientId: string;
  eventId: string;
  personId: string | null;
  status: 'PENDING' | 'COMMITTED' | 'REJECTED';
  createdByMethod: AttendanceCreationMethod;
  scannerCode: string | null;
  manualValue: string | null;
  collectedAt: Date;
  authorUserId: string | null;
  authorName: string | null;
  authorEmail: string | null;
  submittedById: string;
  submittedAt: Date;
  stagedReason: string | null;
  resolutionError: string | null;
  collectedLatitude: number | null;
  collectedLongitude: number | null;
  collectedAccuracyMeters: number | null;
  committedAt: Date | null;
  committedById: string | null;
  rejectedAt: Date | null;
  rejectedById: string | null;
  rejectionReason: string | null;
  event: { id: string; name: string };
};

export type CollectorRecord = {
  id: string;
  userId?: string | null;
  event: {
    startDate: Date;
    endDate: Date;
    deletedAt: Date | null;
    publiclyVisible: boolean;
    shouldCollectAttendance: boolean;
  };
};

export type TxMock = ReturnType<typeof createTxMock>;

type OfflineSubmissionFindUniqueArgs = {
  where: OfflineSubmissionWhere;
};

type OfflineSubmissionWhere = {
  submittedById_clientId: {
    submittedById: string;
    clientId: string;
  };
};

type OfflineSubmissionCreateArgs = {
  data: OfflineSubmissionCreateInput;
};

type OfflineSubmissionUpdateManyArgs = {
  where: {
    submittedById: string;
    clientId: string;
    status: 'PENDING';
  };
  data: Partial<OfflineSubmissionCreateInput>;
};

export function buildOfflineSubmissionRecord(
  input: OfflineSubmissionCreateInput,
  overrides: Partial<OfflineSubmissionRecord> = {},
): OfflineSubmissionRecord {
  return {
    id: 'submission-1',
    clientId: input.clientId,
    eventId: input.eventId,
    personId: input.personId ?? null,
    status: 'PENDING',
    createdByMethod: input.createdByMethod,
    scannerCode: input.scannerCode ?? null,
    manualValue: input.manualValue ?? null,
    collectedAt: input.collectedAt,
    authorUserId: input.authorUserId ?? null,
    authorName: input.authorName ?? null,
    authorEmail: input.authorEmail ?? null,
    submittedById: input.submittedById,
    submittedAt: new Date('2026-05-23T15:30:00.000Z'),
    stagedReason: input.stagedReason ?? null,
    resolutionError: input.resolutionError ?? null,
    collectedLatitude: input.collectedLatitude ?? null,
    collectedLongitude: input.collectedLongitude ?? null,
    collectedAccuracyMeters: input.collectedAccuracyMeters ?? null,
    committedAt: null,
    committedById: null,
    rejectedAt: null,
    rejectedById: null,
    rejectionReason: null,
    event: { id: input.eventId, name: 'Evento' },
    ...overrides,
  };
}

export function scannerAttendance(input: {
  personId: string;
  eventId: string;
  allowSubscription: boolean;
  majorEventId: string | null;
  createdById?: string | null;
}) {
  return {
    personId: input.personId,
    eventId: input.eventId,
    attendedAt: new Date('2026-05-20T12:00:00.000Z'),
    createdById: input.createdById ?? null,
    committedById: null,
    createdByMethod: 'SCANNER',
    person: {
      name: input.personId,
      user: {
        unespRole: ['aluno-graduacao'],
      },
    },
    event: {
      allowSubscription: input.allowSubscription,
      majorEventId: input.majorEventId,
    },
  };
}

export function createPrisma(input: {
  attendances: ReturnType<typeof scannerAttendance>[];
  eventSubscriptions: { personId: string; eventId: string }[];
  majorEventSubscriptions: { personId: string; subscriptionStatus: string }[];
  collectors: { eventId: string; event: unknown }[];
  events?: Array<{ id: string; startDate?: Date } & Record<string, unknown>>;
  people: { id: string; mergedIntoId?: string | null }[];
  collectorUsers: { id: string; name: string }[];
  offlineSubmissions?: OfflineSubmissionRecord[];
}) {
  const offlineSubmissions = new Map<string, OfflineSubmissionRecord>();
  for (const submission of input.offlineSubmissions ?? []) {
    offlineSubmissions.set(offlineSubmissionKey(submission.submittedById, submission.clientId), submission);
  }

  return {
    eventAttendanceCollector: {
      findMany: jest.fn().mockResolvedValue(input.collectors),
      findUnique: jest.fn(),
    },
    eventAttendance: {
      findMany: jest.fn().mockResolvedValue(input.attendances),
    },
    event: {
      findFirst: jest.fn().mockResolvedValue({ id: 'event-1' }),
      findMany: jest.fn().mockResolvedValue(input.events ?? []),
    },
    offlineEventAttendanceSubmission: {
      findUnique: jest.fn(
        async (args: OfflineSubmissionFindUniqueArgs) =>
          offlineSubmissions.get(offlineSubmissionKeyFromWhere(args.where)) ?? null,
      ),
      findUniqueOrThrow: jest.fn(async (args: OfflineSubmissionFindUniqueArgs) => {
        const submission = offlineSubmissions.get(offlineSubmissionKeyFromWhere(args.where));
        if (!submission) {
          throw new Error('Offline submission not found.');
        }

        return submission;
      }),
      create: jest.fn(async (args: OfflineSubmissionCreateArgs) => {
        const submission = buildOfflineSubmissionRecord(args.data, {
          id: `submission-${offlineSubmissions.size + 1}`,
        });
        offlineSubmissions.set(offlineSubmissionKey(submission.submittedById, submission.clientId), submission);
        return submission;
      }),
      updateMany: jest.fn(async (args: OfflineSubmissionUpdateManyArgs) => {
        const submission = offlineSubmissions.get(offlineSubmissionKey(args.where.submittedById, args.where.clientId));
        if (!submission || submission.status !== args.where.status) {
          return { count: 0 };
        }

        Object.assign(submission, args.data);
        return { count: 1 };
      }),
    },
    people: {
      findFirst: jest.fn().mockResolvedValue(input.people[0] ?? null),
      findMany: jest.fn().mockResolvedValue(input.people),
    },
    majorEventSubscription: {
      findMany: jest.fn().mockResolvedValue(input.majorEventSubscriptions),
    },
    eventSubscription: {
      findMany: jest.fn().mockResolvedValue(input.eventSubscriptions),
    },
    user: {
      findMany: jest.fn().mockResolvedValue(input.collectorUsers),
    },
  };
}

export function createCollectionResolver(input: {
  collector?: CollectorRecord | null;
  people?: { id: string; mergedIntoId?: string | null }[];
  transactionResult?: unknown;
  transactionError?: unknown;
  attendanceCategories?: { refreshForAttendance: jest.Mock };
  frozenResources?: { assertEventMutable: jest.Mock };
  grantsAttendancePermission?: boolean;
  offlineSubmissions?: OfflineSubmissionRecord[];
  notificationUsers?: { id: string; email: string; name: string }[];
  notifications?: ReturnType<typeof createNotificationsMock>;
}) {
  const prisma = createPrisma({
    attendances: [],
    eventSubscriptions: [],
    majorEventSubscriptions: [],
    collectors: [],
    people: input.people ?? [],
    collectorUsers: input.notificationUsers ?? [],
    offlineSubmissions: input.offlineSubmissions,
  }) as ReturnType<typeof createPrisma> & {
    $transaction: jest.Mock;
  };
  prisma.eventAttendanceCollector.findUnique.mockResolvedValue(
    Object.prototype.hasOwnProperty.call(input, 'collector') ? input.collector : collectorPerson(),
  );
  prisma.$transaction = jest.fn(async (callback: (tx: TxMock) => Promise<unknown>) => {
    if (input.transactionError) {
      throw input.transactionError;
    }
    return callback(createTxMock(input.transactionResult ?? { id: 'attendance-1' }));
  });
  const currentUserContext = {
    requireCurrentPerson: jest.fn().mockResolvedValue({ id: 'collector-person' }),
  };
  const attendanceCategories = input.attendanceCategories ?? {
    refreshForAttendance: jest.fn().mockResolvedValue(undefined),
  };
  const auditLog = {
    record: jest.fn().mockResolvedValue(undefined),
    buildCompositeEntityId: jest.fn((parts: readonly string[]) => parts.join(':')),
  };
  const frozenResources = input.frozenResources ?? {
    assertEventMutable: jest.fn().mockResolvedValue(undefined),
  };
  const authorizationPolicy = {
    assertPermissions: jest.fn(async () => {
      if (!input.grantsAttendancePermission) {
        throw new ForbiddenException('Missing Event Manager permission grants: event-attendance#collect.');
      }
    }),
    assertAttendanceCollectorForEvent: jest.fn(
      async (
        eventId: string,
        personId: string,
        options: {
          enforceCollectionWindow?: boolean;
        },
      ) => {
        const collector = await prisma.eventAttendanceCollector.findUnique({
          where: {
            eventId_personId: {
              eventId,
              personId,
            },
          },
        });

        if (
          !collector ||
          collector.event.deletedAt ||
          !collector.event.publiclyVisible ||
          !collector.event.shouldCollectAttendance
        ) {
          throw new ForbiddenException('Você não pode coletar presença para este evento.');
        }

        if (options.enforceCollectionWindow && !isCollectionOpen(collector.event.startDate, collector.event.endDate)) {
          throw new ForbiddenException('A coleta de presença não está aberta para este evento.');
        }
      },
    ),
  };

  return {
    resolver: new CurrentUserAttendanceCollectionResolver(
      prisma as never,
      currentUserContext as never,
      attendanceCategories as never,
      frozenResources as never,
      authorizationPolicy as never,
      auditLog as never,
      undefined,
      input.notifications as never,
    ),
    prisma,
    currentUserContext,
    frozenResources,
    authorizationPolicy,
    auditLog,
  };
}

export function createNotificationsMock() {
  return {
    notifyOfflineAttendanceReviewQueued: jest.fn().mockResolvedValue(undefined),
    mapUserToRecipient: jest.fn((user: { id: string; email: string; name: string }) => {
      const [firstName, ...lastNameParts] = user.name.trim().split(/\s+/);
      return {
        subscriberId: user.id,
        email: user.email,
        firstName,
        lastName: lastNameParts.join(' ') || undefined,
        data: { userId: user.id },
      };
    }),
  };
}

export function createTxMock(attendance: unknown) {
  return {
    eventAttendance: {
      create: jest.fn().mockResolvedValue(undefined),
      findUniqueOrThrow: jest.fn().mockResolvedValue(attendance),
    },
  };
}

export function collectorPerson(overrides: Partial<CollectorRecord> = {}): CollectorRecord {
  return {
    id: 'collector-person',
    userId: null,
    event: {
      startDate: new Date(Date.now() - 60_000),
      endDate: new Date(Date.now() + 60_000),
      deletedAt: null,
      publiclyVisible: true,
      shouldCollectAttendance: true,
    },
    ...overrides,
  };
}

export function preciseLocation() {
  return {
    latitude: -22.12,
    longitude: -51.4,
    accuracyMeters: 15,
  };
}

function offlineSubmissionKeyFromWhere(where: OfflineSubmissionWhere): string {
  return offlineSubmissionKey(where.submittedById_clientId.submittedById, where.submittedById_clientId.clientId);
}

function offlineSubmissionKey(submittedById: string, clientId: string): string {
  return `${submittedById}:${clientId}`;
}

function isCollectionOpen(startDate: Date, endDate: Date): boolean {
  return isWithinInterval(new Date(), {
    start: subHours(startDate, 3),
    end: addHours(endDate, 6),
  });
}
