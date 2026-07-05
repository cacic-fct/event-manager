import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  AttendanceCreationMethod,
  EventManagerPermissionGrantScope,
  UserRole,
} from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import { recordAttendanceCreate } from './attendance-collection-audit';
import {
  commitStatusForError,
  errorMessage,
  getActorId,
  getAuthenticatedUser,
  isRequiredLocationError,
  normalizeOptionalString,
  parseStoredScannerUserId,
  parseUserAztecCode,
  scannerUserIdForStorage,
} from './attendance-collection-context';
import { notifyOfflineAttendanceReviewQueued } from './attendance-collection-offline-notifications';
import {
  findSinglePersonForManualInput,
  getRequiredAttendanceLocationData,
  toEventAttendance,
} from './attendance-collection-records';

describe('attendance collection helpers', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('parses authenticated context and maps offline commit errors', () => {
    const currentUser = { sub: 'user-from-service', email: 'service@example.com' };
    const currentUserContext = {
      getAuthenticatedUser: jest.fn(() => currentUser),
    };

    expect(getAuthenticatedUser(currentUserContext as never, { req: { user: { sub: 'fallback' } } } as never)).toBe(
      currentUser,
    );
    expect(getActorId({ request: { user: { sub: 'request-user' } } } as never)).toBe('request-user');
    expect(normalizeOptionalString('  Ada  ')).toBe('Ada');
    expect(normalizeOptionalString('   ')).toBeUndefined();
    expect(parseUserAztecCode(' user:account-1 ')).toBe('account-1');
    expect(parseUserAztecCode('user:account-1:extra')).toBeNull();
    expect(parseUserAztecCode('account-1')).toBeNull();
    expect(scannerUserIdForStorage('user:account-1')).toBe('account-1');
    expect(scannerUserIdForStorage('account-1')).toBeNull();
    expect(parseStoredScannerUserId('account-1')).toBe('account-1');
    expect(parseStoredScannerUserId('user:account-1')).toBe('account-1');
    expect(parseStoredScannerUserId('anonymized:request-1')).toBeNull();
    expect(commitStatusForError(new ConflictException('Presença já registrada para este evento.'))).toBe('DUPLICATE');
    expect(commitStatusForError(new ConflictException('Coleta fora da janela.'))).toBe('CONFLICT');
    expect(commitStatusForError(new ForbiddenException('Sem permissão.'))).toBe('FORBIDDEN');
    expect(commitStatusForError(new Error('erro inesperado'))).toBe('FAILED');
    expect(
      isRequiredLocationError(new BadRequestException('Localização precisa é obrigatória para registrar presença.')),
    ).toBe(true);
    expect(errorMessage(new BadRequestException({ message: ['Campo obrigatório.', 'Valor inválido.'] }))).toBe(
      'Campo obrigatório.\nValor inválido.',
    );
  });

  it('validates precise location and normalizes attendance records for the API', () => {
    expect(getRequiredAttendanceLocationData({ latitude: -22.1, longitude: -51.4, accuracyMeters: 25 })).toEqual({
      collectedLatitude: -22.1,
      collectedLongitude: -51.4,
      collectedAccuracyMeters: 25,
    });
    expect(() => getRequiredAttendanceLocationData(undefined)).toThrow(BadRequestException);
    expect(() =>
      getRequiredAttendanceLocationData({ latitude: -22.1, longitude: -51.4, accuracyMeters: 250 }),
    ).toThrow(BadRequestException);
    expect(
      toEventAttendance({
        personId: 'person-1',
        eventId: 'event-1',
        category: 'REGULAR',
        attendedAt: new Date('2026-07-01T12:00:00.000Z'),
        createdAt: new Date('2026-07-01T12:00:00.000Z'),
        createdById: null,
        committedById: null,
        createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
        collectedLatitude: null,
        collectedLongitude: null,
        collectedAccuracyMeters: null,
      }),
    ).toEqual(
      expect.objectContaining({
        personId: 'person-1',
        createdById: undefined,
        committedById: undefined,
        collectedLatitude: undefined,
      }),
    );
  });

  it('finds manual attendance people by email, document, or Brazilian phone aliases', async () => {
    const prisma = {
      people: {
        findMany: jest.fn().mockResolvedValue([{ id: 'source-person', mergedIntoId: 'target-person' }]),
      },
    };

    await expect(findSinglePersonForManualInput(prisma as never, ' (18) 99999-0000 ')).resolves.toEqual({
      id: 'target-person',
    });

    expect(prisma.people.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        OR: expect.arrayContaining([
          { email: { equals: '(18) 99999-0000', mode: 'insensitive' } },
          { secondaryEmails: { has: '(18) 99999-0000' } },
          { identityDocument: { in: ['(18) 99999-0000', '18999990000'] } },
          {
            phone: {
              in: expect.arrayContaining(['18999990000', '5518999990000', '+5518999990000']),
            },
          },
        ]),
      },
      select: { id: true, mergedIntoId: true },
    });

    prisma.people.findMany.mockResolvedValueOnce([
      { id: 'person-1', mergedIntoId: null },
      { id: 'person-2', mergedIntoId: null },
    ]);
    await expect(findSinglePersonForManualInput(prisma as never, 'ada@example.com')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('records attendance creation audit entries with scoped metadata', async () => {
    const actor = { sub: 'collector-user', email: 'collector@example.com' };
    const auditLog = {
      buildCompositeEntityId: jest.fn(() => 'person-1:event-1'),
      record: jest.fn(),
    };
    const currentUserContext = {
      getAuthenticatedUser: jest.fn(() => actor),
    };
    const tx = {};

    await recordAttendanceCreate({
      auditLog: auditLog as never,
      currentUserContext: currentUserContext as never,
      context: {} as never,
      attendance: { personId: 'person-1', eventId: 'event-1' },
      summary: 'Presença coletada.',
      prisma: tx as never,
      metadata: { offlineClientId: 'client-1' },
    });

    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'person-1:event-1',
        entityLabel: 'person-1',
        actor,
        scope: {
          permission: Permission.EventAttendance.Collect,
          eventId: 'event-1',
        },
        metadata: { offlineClientId: 'client-1' },
      }),
      tx,
    );
  });

  it('notifies admins and scoped reviewers when an offline submission is queued', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
    const users = [
      { id: 'admin-user', email: 'admin@example.com', name: 'Admin User' },
      { id: 'reviewer-user', email: 'reviewer@example.com', name: 'Reviewer User' },
    ];
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue(users),
      },
    };
    const notifications = {
      mapUserToRecipient: jest.fn((user: { id: string; email: string; name: string }) => ({
        subscriberId: user.id,
        email: user.email,
        firstName: user.name.split(' ')[0],
      })),
      notifyOfflineAttendanceReviewQueued: jest.fn(),
    };

    await notifyOfflineAttendanceReviewQueued({
      prisma: prisma as never,
      notifications: notifications as never,
      submission: {
        id: 'submission-1',
        eventId: 'event-1',
        event: {
          name: 'Credenciamento',
          majorEventId: 'major-1',
          eventGroupId: 'group-1',
        },
        submittedById: 'collector-user',
        submittedAt: new Date('2026-07-01T11:55:00.000Z'),
        authorName: 'Coletor offline',
      },
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { role: UserRole.ADMIN },
          {
            eventManagerPermissionGrants: {
              some: expect.objectContaining({
                permission: Permission.EventAttendance.Update,
                deletedAt: null,
                OR: [{ validFrom: null }, { validFrom: { lte: new Date('2026-07-01T12:00:00.000Z') } }],
                AND: [
                  { OR: [{ validUntil: null }, { validUntil: { gt: new Date('2026-07-01T12:00:00.000Z') } }] },
                  {
                    OR: expect.arrayContaining([
                      { scope: EventManagerPermissionGrantScope.GLOBAL },
                      { scope: EventManagerPermissionGrantScope.EVENT, eventId: 'event-1' },
                      { scope: EventManagerPermissionGrantScope.MAJOR_EVENT, majorEventId: 'major-1' },
                      { scope: EventManagerPermissionGrantScope.EVENT_GROUP, eventGroupId: 'group-1' },
                    ]),
                  },
                ],
              }),
            },
          },
        ],
      },
      select: { id: true, email: true, name: true },
    });
    expect(notifications.notifyOfflineAttendanceReviewQueued).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionId: 'submission-1',
        eventId: 'event-1',
        eventName: 'Credenciamento',
        recipients: [
          expect.objectContaining({ subscriberId: 'admin-user' }),
          expect.objectContaining({ subscriberId: 'reviewer-user' }),
        ],
        submittedById: 'collector-user',
        authorName: 'Coletor offline',
      }),
    );
  });
});
