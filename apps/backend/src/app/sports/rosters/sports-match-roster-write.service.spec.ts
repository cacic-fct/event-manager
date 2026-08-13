import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  AuditLogOperation,
  SportsMatchState,
  SportsRosterEntryStatus,
  SportsRosterRole,
  SportsRosterStatus,
} from '@prisma/client';
import {
  sportsRosterPersistenceMatch,
  sportsRosterPersistenceRecord,
  sportsRosterWriteInput,
} from '../testing/sports-backend.fixtures';
import { SportsMatchRosterService } from './sports-match-roster.service';

describe('SportsMatchRosterWriteService', () => {
  const actor = { id: 'actor-1', name: 'Pessoa Administradora', type: 'USER' };
  const auditLog = { record: jest.fn() };
  const mutationEvents = { publishRosterMutation: jest.fn() };
  let tx: ReturnType<typeof transaction>;
  let prisma: { $transaction: jest.Mock };
  let service: SportsMatchRosterService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx = transaction();
    prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    service = new SportsMatchRosterService(prisma as never, {} as never, auditLog as never, mutationEvents as never);
  });

  it('creates a submitted roster, replaces its live entries, audits, and publishes the mutation', async () => {
    tx.sportsMatchRosterEntry.findFirst.mockResolvedValueOnce({ id: 'entry-player' }).mockResolvedValueOnce(null);

    const result = await service.upsert(sportsRosterWriteInput() as never, 'actor-1', actor as never, false);

    expect(result).toMatchObject({ id: 'roster-1', status: SportsRosterStatus.SUBMITTED });
    expect(tx.sportsMatchRoster.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        matchId: 'match-1',
        registrationId: 'registration-home',
        status: SportsRosterStatus.SUBMITTED,
        manuallyEdited: true,
      }),
    });
    expect(tx.sportsMatchRosterEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ registrationMemberId: { notIn: ['member-player', 'member-coach'] } }),
      }),
    );
    expect(tx.sportsMatchRosterEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-player' },
      data: expect.objectContaining({
        role: SportsRosterRole.PLAYER,
        shirtNumber: '10',
        status: SportsRosterEntryStatus.SUBMITTED,
      }),
    });
    expect(tx.sportsMatchRosterEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        registrationMemberId: 'member-coach',
        roleMetadata: { certification: 'Nível 1' },
        status: SportsRosterEntryStatus.SUBMITTED,
      }),
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ operation: AuditLogOperation.CREATE, summary: 'Escalação enviada para análise.' }),
      tx,
    );
    expect(mutationEvents.publishRosterMutation).toHaveBeenCalledWith('match-1', 'ROSTER_SUBMITTED', 'roster-1');
  });

  it('updates and approves an existing roster for a trusted administrator', async () => {
    const existing = sportsRosterPersistenceRecord({ revision: 3 });
    tx.sportsMatch.findFirst.mockResolvedValue(sportsRosterPersistenceMatch({ state: SportsMatchState.LIVE }));
    tx.sportsMatchRoster.findFirst.mockResolvedValue(existing);
    tx.sportsMatchRoster.findUniqueOrThrow
      .mockResolvedValueOnce(sportsRosterPersistenceRecord({ revision: 4, status: SportsRosterStatus.APPROVED }))
      .mockResolvedValueOnce(
        sportsRosterPersistenceRecord({ revision: 4, status: SportsRosterStatus.APPROVED, entries: [] }),
      );
    tx.sportsMatchRosterEntry.findFirst.mockResolvedValueOnce({ id: 'entry-player' }).mockResolvedValueOnce(null);

    await service.upsert(
      sportsRosterWriteInput({
        expectedRevision: 3,
        entries: [
          {
            registrationMemberId: 'member-player',
            role: SportsRosterRole.PLAYER,
            shirtNumber: '10',
            roleMetadata: { captain: true },
          },
          { registrationMemberId: 'member-coach', role: SportsRosterRole.COACH },
        ],
      }) as never,
      'actor-1',
      actor as never,
      true,
    );

    expect(tx.sportsMatchRoster.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'roster-1', revision: 3 }),
        data: expect.objectContaining({ status: SportsRosterStatus.APPROVED }),
      }),
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: AuditLogOperation.UPDATE,
        before: { status: SportsRosterStatus.SUBMITTED, revision: 3, entryCount: 1 },
        summary: 'Escalação atualizada por administrador.',
      }),
      tx,
    );
    expect(tx.sportsMatchRosterEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          roleMetadata: { captain: true },
          status: SportsRosterEntryStatus.APPROVED,
        }),
      }),
    );
    expect(tx.sportsMatchRosterEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: SportsRosterEntryStatus.APPROVED }) }),
    );
    expect(mutationEvents.publishRosterMutation).toHaveBeenCalledWith('match-1', 'ROSTER_APPROVED', 'roster-1');
  });

  it.each([
    ['missing match', () => tx.sportsMatch.findFirst.mockResolvedValue(null), NotFoundException],
    [
      'started match for representative',
      () => tx.sportsMatch.findFirst.mockResolvedValue(sportsRosterPersistenceMatch({ state: SportsMatchState.LIVE })),
      ConflictException,
    ],
    [
      'unrelated registration',
      () => undefined,
      BadRequestException,
      sportsRosterWriteInput({ registrationId: 'registration-other' }),
    ],
    [
      'ineligible member',
      () =>
        tx.sportsRegistrationMember.findMany.mockResolvedValue([
          { id: 'member-player', role: SportsRosterRole.PLAYER },
        ]),
      BadRequestException,
    ],
    [
      'role mismatch',
      () =>
        tx.sportsRegistrationMember.findMany.mockResolvedValue([
          { id: 'member-player', role: SportsRosterRole.COACH },
          { id: 'member-coach', role: SportsRosterRole.COACH },
        ]),
      BadRequestException,
    ],
    [
      'roster size exceeded',
      () =>
        tx.sportsMatch.findFirst.mockResolvedValue(
          sportsRosterPersistenceMatch({
            category: {
              ...(sportsRosterPersistenceMatch().category as object),
              maximumRosterSize: 0,
            },
          }),
        ),
      BadRequestException,
    ],
  ])('rejects a %s', async (_name, arrange, error, customInput = sportsRosterWriteInput()) => {
    arrange();

    await expect(service.upsert(customInput as never, 'actor-1', actor as never, false)).rejects.toBeInstanceOf(error);

    expect(mutationEvents.publishRosterMutation).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, 3, 'missing expected revision'],
    [2, 3, 'stale expected revision'],
  ])('rejects %s against revision %s (%s)', async (expectedRevision, revision) => {
    tx.sportsMatchRoster.findFirst.mockResolvedValue(sportsRosterPersistenceRecord({ revision }));

    await expect(
      service.upsert(sportsRosterWriteInput({ expectedRevision }) as never, 'actor-1', actor as never, false),
    ).rejects.toThrow('A escalação mudou. Recarregue os dados e tente novamente.');
  });

  it('rejects a concurrent roster update after the revision check', async () => {
    tx.sportsMatchRoster.findFirst.mockResolvedValue(sportsRosterPersistenceRecord({ revision: 3 }));
    tx.sportsMatchRoster.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.upsert(sportsRosterWriteInput({ expectedRevision: 3 }) as never, 'actor-1', actor as never, false),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([
    ['APPROVE', SportsRosterStatus.APPROVED, SportsRosterEntryStatus.APPROVED, AuditLogOperation.APPROVE],
    ['REJECT', SportsRosterStatus.REJECTED, SportsRosterEntryStatus.REJECTED, AuditLogOperation.REJECT],
  ] as const)('reviews a submitted roster with %s', async (decision, status, entryStatus, operation) => {
    const roster = sportsRosterPersistenceRecord({
      match: {
        eventId: 'event-1',
        category: { eventGroupId: 'event-group-1', tournament: { majorEventId: 'major-event-1' } },
      },
    });
    tx.sportsMatchRoster.findFirst.mockResolvedValue(roster);
    tx.sportsMatchRoster.update.mockResolvedValue(sportsRosterPersistenceRecord({ status, revision: 2 }));

    await expect(service.review('roster-1', decision, 'actor-1', actor as never)).resolves.toMatchObject({ status });

    expect(tx.sportsMatchRoster.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status,
          entries: {
            updateMany: { where: { deletedAt: null }, data: { status: entryStatus, updatedById: 'actor-1' } },
          },
        }),
      }),
    );
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ operation }), tx);
    expect(mutationEvents.publishRosterMutation).toHaveBeenCalledWith(
      'match-1',
      decision === 'APPROVE' ? 'ROSTER_APPROVED' : 'ROSTER_REJECTED',
      'roster-1',
    );
  });

  it('rejects review for a missing or non-submitted roster', async () => {
    tx.sportsMatchRoster.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(sportsRosterPersistenceRecord({ status: SportsRosterStatus.APPROVED }));

    await expect(service.review('missing', 'APPROVE', 'actor-1', actor as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.review('roster-1', 'APPROVE', 'actor-1', actor as never)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

function transaction() {
  const roster = sportsRosterPersistenceRecord({ status: SportsRosterStatus.SUBMITTED, revision: 1, entries: [] });
  return {
    sportsMatch: { findFirst: jest.fn().mockResolvedValue(sportsRosterPersistenceMatch()) },
    sportsRegistrationMember: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'member-player', role: SportsRosterRole.PLAYER },
        { id: 'member-coach', role: SportsRosterRole.COACH },
      ]),
    },
    sportsMatchRoster: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(roster),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue(roster),
    },
    sportsMatchRosterEntry: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      create: jest.fn(),
    },
  };
}
