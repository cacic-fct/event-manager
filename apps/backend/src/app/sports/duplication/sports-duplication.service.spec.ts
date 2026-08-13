import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SportsDuplicationService } from './sports-duplication.service';
import { SportsTeamDuplicationService } from './sports-team-duplication.service';

describe('SportsDuplicationService', () => {
  const actor = { sub: 'admin-1' };

  it('checks the destination MajorEvent freeze before cloning a tournament', async () => {
    const frozen = {
      assertMajorEventMutable: jest.fn().mockRejectedValue(new ForbiddenException()),
    };
    const prisma = { $transaction: jest.fn() };
    const service = createService(prisma, {}, frozen);

    await expect(
      service.cloneTournament(
        {
          sourceTournamentId: 'source-1',
          destinationMajorEventId: 'major-2',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(frozen.assertMajorEventMutable).toHaveBeenCalledWith('major-2', actor, 'edit');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(['category', 'team'] as const)(
    'resolves and checks the destination tournament before cloning a %s',
    async (kind) => {
      const frozen = {
        assertMajorEventMutable: jest.fn().mockRejectedValue(new ForbiddenException()),
      };
      const prisma = {
        sportsTournament: {
          findFirst: jest.fn().mockResolvedValue({ majorEventId: 'major-2' }),
        },
        $transaction: jest.fn(),
      };
      const service = createService(prisma, {}, frozen);

      const operation =
        kind === 'category'
          ? service.cloneCategory(
              {
                sourceCategoryId: 'category-1',
                destinationTournamentId: 'tournament-2',
              },
              actor,
            )
          : service.cloneTeam(
              {
                sourceTeamId: 'team-1',
                destinationTournamentId: 'tournament-2',
              },
              actor,
            );

      await expect(operation).rejects.toBeInstanceOf(ForbiddenException);
      expect(frozen.assertMajorEventMutable).toHaveBeenCalledWith('major-2', actor, 'edit');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('copies logo metadata only when cloning a team with includeLogo enabled', async () => {
    const createdTeam = { id: 'team-2', name: 'Equipe clonada' };
    const tx = {
      sportsTeam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'team-1',
          name: 'Equipe original',
          institution: 'Instituição',
          logoObjectKey: 'sports/team-1/logo.png',
          logoSha256: 'abc123',
          logoMimeType: 'image/png',
          logoSizeBytes: 1234,
          representatives: [],
          members: [],
        }),
        create: jest.fn().mockResolvedValue(createdTeam),
      },
      sportsTournament: {
        findFirst: jest.fn().mockResolvedValue({ id: 'tournament-2', majorEventId: 'major-2' }),
      },
    };
    const prisma = {
      sportsTournament: {
        findFirst: jest.fn().mockResolvedValue({ majorEventId: 'major-2' }),
      },
      $transaction: jest
        .fn()
        .mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const auditLog = { record: jest.fn() };
    const frozen = { assertMajorEventMutable: jest.fn() };
    const service = createService(prisma, auditLog, frozen);

    await expect(
      service.cloneTeam(
        {
          sourceTeamId: 'team-1',
          destinationTournamentId: 'tournament-2',
          includeLogo: true,
        },
        actor,
      ),
    ).resolves.toEqual(createdTeam);

    expect(tx.sportsTeam.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        logoObjectKey: 'sports/team-1/logo.png',
        logoSha256: 'abc123',
        logoMimeType: 'image/png',
        logoSizeBytes: 1234,
      }),
    });
  });

  it('rejects actors without a stable identifier before freeze or transaction work', async () => {
    const frozen = { assertMajorEventMutable: jest.fn() };
    const prisma = { $transaction: jest.fn() };

    await expect(
      createService(prisma, {}, frozen).cloneTournament(
        { sourceTournamentId: 'source-1', destinationMajorEventId: 'major-2' },
        {} as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(frozen.assertMajorEventMutable).not.toHaveBeenCalled();
  });

  it('validates source, destination, existing tournament, and registration dependencies transactionally', async () => {
    const frozen = { assertMajorEventMutable: jest.fn() };
    const tx = tournamentTransactionFixture();
    const prisma = transactionPrisma(tx);
    const service = createService(prisma, {}, frozen);

    tx.sportsTournament.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.cloneTournament({ sourceTournamentId: 'missing', destinationMajorEventId: 'major-2' }, actor),
    ).rejects.toBeInstanceOf(NotFoundException);

    tx.sportsTournament.findFirst.mockResolvedValueOnce(tournamentSourceFixture());
    tx.majorEvent.findFirst.mockResolvedValueOnce({
      id: 'major-2',
      name: 'Destino',
      sportsTournament: { id: 'existing', deletedAt: null },
    });
    await expect(
      service.cloneTournament({ sourceTournamentId: 'source-1', destinationMajorEventId: 'major-2' }, actor),
    ).rejects.toBeInstanceOf(ConflictException);

    tx.sportsTournament.findFirst.mockResolvedValueOnce(tournamentSourceFixture());
    tx.majorEvent.findFirst.mockResolvedValueOnce({ id: 'major-2', name: 'Destino', sportsTournament: null });
    await expect(
      service.cloneTournament(
        {
          sourceTournamentId: 'source-1',
          destinationMajorEventId: 'major-2',
          parts: { registrations: true, categories: false, teams: true },
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('clones all tournament parts with draft states, remapped relations, sanitized dates, and one audit', async () => {
    const tx = tournamentTransactionFixture();
    const prisma = transactionPrisma(tx);
    const auditLog = { record: jest.fn() };
    const frozen = { assertMajorEventMutable: jest.fn() };

    const result = await createService(prisma, auditLog, frozen).cloneTournament(
      { sourceTournamentId: 'source-1', destinationMajorEventId: 'major-2' },
      actor,
    );

    expect(result).toEqual({ id: 'tournament-copy' });
    expect(tx.sportsTournament.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        majorEventId: 'major-2',
        status: 'DRAFT',
        selfSubscriptionEnabled: false,
        createdById: actor.sub,
      }),
    });
    expect(tx.sportsCategory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tournamentId: 'tournament-copy',
        eventGroupId: 'event-group-copy',
        registrationStartDate: null,
        registrationEndDate: null,
        scoreRules: { win: 3 },
      }),
    });
    expect(tx.sportsRegistration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ teamId: 'team-copy', categoryId: 'category-copy', status: 'DRAFT' }),
    });
    expect(tx.sportsVenue.update).toHaveBeenCalledWith({
      where: { id: 'venue-child-copy' },
      data: { parentVenueId: 'venue-parent-copy' },
    });
    expect(tx.sportsOfficialAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tournamentId: 'tournament-copy', categoryId: 'category-copy' }),
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'tournament-copy', summary: 'Torneio esportivo duplicado.' }),
      tx,
    );
  });

  it('clones a category with matching-team registrations, sanitized stages, officials, and trimmed name', async () => {
    const source = categorySourceFixture();
    const tx = {
      sportsCategory: {
        findFirst: jest.fn().mockResolvedValue(source),
        create: jest.fn().mockResolvedValue({ id: 'category-copy', name: 'Futsal renovado' }),
      },
      sportsTournament: { findFirst: jest.fn().mockResolvedValue({ id: 'tournament-2', majorEventId: 'major-2' }) },
      eventGroup: { create: jest.fn().mockResolvedValue({ id: 'event-group-copy' }) },
      sportsTeam: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'team-match', name: 'EQUIPE AZUL', institution: 'FCT' },
          { id: 'team-other', name: 'Equipe Verde', institution: 'Outra' },
        ]),
      },
      sportsRegistration: { create: jest.fn().mockResolvedValue({}) },
      sportsStage: { create: jest.fn().mockResolvedValue({}) },
      sportsOfficialAssignment: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      sportsTournament: { findFirst: jest.fn().mockResolvedValue({ majorEventId: 'major-2' }) },
      ...transactionPrisma(tx),
    };
    const auditLog = { record: jest.fn() };
    const result = await createService(prisma, auditLog, { assertMajorEventMutable: jest.fn() }).cloneCategory(
      {
        sourceCategoryId: 'category-1',
        destinationTournamentId: 'tournament-2',
        name: '  Futsal renovado  ',
        includeRegistrations: true,
        includeStages: true,
        includeOfficials: true,
      },
      actor,
    );

    expect(result).toEqual({ id: 'category-copy', name: 'Futsal renovado' });
    expect(tx.sportsRegistration.create).toHaveBeenCalledTimes(1);
    expect(tx.sportsRegistration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ teamId: 'team-match', categoryId: 'category-copy', seed: 2 }),
    });
    expect(tx.sportsStage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        settings: { publicOption: true },
        categoryId: 'category-copy',
      }),
    });
    expect(tx.sportsOfficialAssignment.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ categoryId: 'category-copy', personId: 'person-1' })],
    });
  });

  it('reports missing category destinations before freezing and missing transactional sources after freezing', async () => {
    const frozen = { assertMajorEventMutable: jest.fn() };
    const missingScopePrisma = { sportsTournament: { findFirst: jest.fn().mockResolvedValue(null) } };
    await expect(
      createService(missingScopePrisma, {}, frozen).cloneCategory(
        { sourceCategoryId: 'category-1', destinationTournamentId: 'missing' },
        actor,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(frozen.assertMajorEventMutable).not.toHaveBeenCalled();

    const tx = {
      sportsCategory: { findFirst: jest.fn().mockResolvedValue(null) },
      sportsTournament: { findFirst: jest.fn().mockResolvedValue({ id: 'tournament-2', majorEventId: 'major-2' }) },
    };
    const prisma = {
      sportsTournament: { findFirst: jest.fn().mockResolvedValue({ majorEventId: 'major-2' }) },
      ...transactionPrisma(tx),
    };
    await expect(
      createService(prisma, {}, frozen).cloneCategory(
        { sourceCategoryId: 'missing', destinationTournamentId: 'tournament-2' },
        actor,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  function createService(prisma: object, auditLog: object, frozen: object): SportsDuplicationService {
    const teamDuplicator = new SportsTeamDuplicationService(
      prisma as never,
      {} as never,
      auditLog as never,
      frozen as never,
    );
    return new SportsDuplicationService(prisma as never, auditLog as never, frozen as never, teamDuplicator);
  }
});

function transactionPrisma<T extends object>(tx: T) {
  return {
    $transaction: jest.fn().mockImplementation(async (callback: (client: T) => Promise<unknown>) => callback(tx)),
  };
}

function tournamentSourceFixture() {
  return {
    id: 'source-1',
    scoringMode: 'BY_CATEGORY',
    allowPlayerMultipleTeams: false,
    categories: [
      {
        id: 'category-1',
        name: 'Futsal',
        sport: 'FUTSAL',
        customSportName: null,
        division: 'Aberto',
        format: 'SINGLE_ELIMINATION',
        minimumRosterSize: 5,
        maximumRosterSize: 12,
        maximumCaptains: 1,
        maximumCoaches: 2,
        allowPlayerMultipleTeams: false,
        periodsEnabled: true,
        maximumPeriods: 2,
        periodLabel: 'Tempo',
        scoreRules: { win: 3 },
        overallScoringRules: { first: 10 },
        rosterRules: {},
        bracketRules: {},
        standingsRules: {},
        rulesText: 'Regras públicas',
        registrations: [
          { teamId: 'team-1', seed: 2, formAnswers: { answer: true }, formSchemaSnapshot: { version: 1 } },
          { teamId: 'orphan-team', seed: null, formAnswers: null, formSchemaSnapshot: null },
        ],
      },
    ],
    teams: [
      {
        id: 'team-1',
        name: 'Equipe Azul',
        institution: 'FCT',
        logoObjectKey: 'sports/logo.png',
        logoSha256: 'sha',
        logoMimeType: 'image/png',
        logoSizeBytes: 100,
      },
    ],
    venues: [
      {
        id: 'venue-parent',
        parentVenueId: null,
        placePresetId: null,
        name: 'Ginásio',
        courtLabel: null,
        capacity: 100,
        notes: null,
      },
      {
        id: 'venue-child',
        parentVenueId: 'venue-parent',
        placePresetId: null,
        name: 'Quadra',
        courtLabel: '1',
        capacity: 50,
        notes: null,
      },
    ],
    officials: [{ categoryId: 'category-1', personId: 'person-1', role: 'REFEREE' }],
  };
}

function tournamentTransactionFixture() {
  let venue = 0;
  return {
    sportsTournament: {
      findFirst: jest.fn().mockResolvedValue(tournamentSourceFixture()),
      create: jest.fn().mockResolvedValue({ id: 'tournament-copy' }),
    },
    majorEvent: {
      findFirst: jest.fn().mockResolvedValue({ id: 'major-2', name: 'Destino', sportsTournament: null }),
    },
    eventGroup: { create: jest.fn().mockResolvedValue({ id: 'event-group-copy' }) },
    sportsCategory: { create: jest.fn().mockResolvedValue({ id: 'category-copy' }) },
    sportsTeam: { create: jest.fn().mockResolvedValue({ id: 'team-copy' }) },
    sportsRegistration: { create: jest.fn().mockResolvedValue({}) },
    sportsVenue: {
      create: jest.fn().mockImplementation(() =>
        Promise.resolve({ id: venue++ === 0 ? 'venue-parent-copy' : 'venue-child-copy' }),
      ),
      update: jest.fn().mockResolvedValue({}),
    },
    sportsOfficialAssignment: { create: jest.fn().mockResolvedValue({}) },
  };
}

function categorySourceFixture() {
  return {
    id: 'category-1',
    name: 'Futsal',
    sport: 'FUTSAL',
    customSportName: null,
    division: 'Aberto',
    format: 'SINGLE_ELIMINATION',
    minimumRosterSize: 5,
    maximumRosterSize: 12,
    maximumCaptains: 1,
    maximumCoaches: 2,
    allowPlayerMultipleTeams: false,
    periodsEnabled: true,
    maximumPeriods: 2,
    periodLabel: 'Tempo',
    scoreRules: {},
    overallScoringRules: {},
    rosterRules: {},
    bracketRules: {},
    standingsRules: {},
    rulesText: 'Regras',
    eventGroup: { emoji: '⚽' },
    registrations: [
      { seed: 2, team: { name: 'Equipe Azul', institution: 'FCT' } },
      { seed: 3, team: { name: 'Equipe ausente', institution: 'FCT' } },
    ],
    stages: [
      {
        name: 'Final',
        type: 'FINAL',
        displayOrder: 1,
        settings: {
          publicOption: true,
          qualifierSlotsByMatch: {},
          structuralByeSides: [],
          resetRule: {},
          generationFingerprint: 'stale',
        },
      },
      {
        name: 'Configuração inválida',
        type: 'GROUP',
        displayOrder: 2,
        settings: null,
      },
    ],
    officialAssignments: [{ personId: 'person-1', role: 'REFEREE' }],
  };
}
