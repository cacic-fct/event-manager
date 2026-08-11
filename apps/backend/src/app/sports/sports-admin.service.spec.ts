import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  PublicationState,
  SportsCategoryStatus,
  SportsFormat,
  SportsPreset,
  SportsRegistrationStatus,
  SportsScoringMode,
  SportsScoreEntrySource,
  SportsTournamentStatus,
} from '@prisma/client';
import { SportsAdminService } from './sports-admin.service';

describe('SportsAdminService', () => {
  const actor = {
    sub: 'admin-1',
    token: 'token',
    permissionSet: new Set<string>(),
  } as never;
  const prisma = {
    sportsCategory: {
      findFirst: jest.fn(),
    },
    sportsMatch: {
      findFirst: jest.fn(),
    },
    sportsTournament: {
      findFirst: jest.fn(),
    },
    sportsTournamentScoreEntry: {
      findFirst: jest.fn(),
    },
    sportsRegistration: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const frozen = {
    assertEventGroupMutable: jest.fn(),
    assertEventMutable: jest.fn(),
    assertMajorEventMutable: jest.fn(),
  };
  const auditLog = {
    record: jest.fn(),
  };
  let tx: ReturnType<typeof createTransaction>;
  let service: SportsAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx = createTransaction();
    prisma.$transaction.mockImplementation((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
    service = new SportsAdminService(prisma as never, frozen as never, auditLog as never);
  });

  it('attaches a compatible existing Event and enables shared attendance', async () => {
    prisma.sportsCategory.findFirst.mockResolvedValue({
      eventGroupId: 'group-1',
    });
    tx.sportsCategory.findFirst.mockResolvedValue(createCategory());
    tx.event.findFirst.mockResolvedValue(createEvent());
    tx.event.update.mockResolvedValue({
      ...createEvent(),
      shouldCollectAttendance: true,
    });
    tx.sportsMatch.create.mockResolvedValue({
      id: 'match-1',
      eventId: 'event-1',
      categoryId: 'category-1',
      state: 'SCHEDULED',
      reviewStatus: 'NOT_REQUIRED',
      revision: 1,
      event: {
        ...createEvent(),
        shouldCollectAttendance: true,
      },
    });

    const result = await service.createMatch(
      {
        categoryId: 'category-1',
        eventId: 'event-1',
      },
      actor,
    );

    expect(frozen.assertEventGroupMutable).toHaveBeenCalledWith('group-1', actor, 'edit');
    expect(frozen.assertEventMutable).toHaveBeenCalledWith('event-1', actor, 'edit');
    expect(tx.event.update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: expect.objectContaining({
        shouldCollectAttendance: true,
        allowSubscription: false,
      }),
    });
    expect(tx.event.create).not.toHaveBeenCalled();
    expect(result.id).toBe('match-1');
  });

  it('rejects an Event outside the category EventGroup or MajorEvent', async () => {
    prisma.sportsCategory.findFirst.mockResolvedValue({
      eventGroupId: 'group-1',
    });
    tx.sportsCategory.findFirst.mockResolvedValue(createCategory());
    tx.event.findFirst.mockResolvedValue({
      ...createEvent(),
      eventGroupId: 'another-group',
    });

    await expect(
      service.createMatch(
        {
          categoryId: 'category-1',
          eventId: 'event-1',
        },
        actor,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(tx.sportsMatch.create).not.toHaveBeenCalled();
  });

  it('does not partially delete a match after a stale revision', async () => {
    prisma.sportsMatch.findFirst.mockResolvedValue({
      id: 'match-1',
      eventId: 'event-1',
      categoryId: 'category-1',
      state: 'SCHEDULED',
      reviewStatus: 'NOT_REQUIRED',
      revision: 3,
      event: createEvent(),
      category: {
        eventGroupId: 'group-1',
        tournament: { majorEventId: 'major-1' },
      },
    });
    tx.sportsMatch.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.deleteMatch('match-1', 2, actor)).rejects.toThrow(ConflictException);

    expect(tx.event.updateMany).not.toHaveBeenCalled();
    expect(auditLog.record).not.toHaveBeenCalled();
  });

  it('clears the stored livestream URL when its provider is disabled', async () => {
    tx.sportsMatch.findFirst.mockResolvedValue({
      id: 'match-1',
      eventId: 'event-1',
      categoryId: 'category-1',
      stageId: null,
      venueId: null,
      homeRegistrationId: null,
      awayRegistrationId: null,
      winnerAdvancesToId: null,
      loserAdvancesToId: null,
      revision: 3,
      livestreamProvider: 'YOUTUBE',
      livestreamUrl: 'https://www.youtube.com/watch?v=video-1',
      event: createEvent(),
      category: {
        id: 'category-1',
        eventGroupId: 'group-1',
        tournamentId: 'tournament-1',
        tournament: { majorEventId: 'major-1' },
      },
    });
    tx.sportsMatch.updateMany.mockResolvedValue({ count: 1 });
    tx.sportsMatch.findUniqueOrThrow.mockResolvedValue({
      id: 'match-1',
      eventId: 'event-1',
      categoryId: 'category-1',
      revision: 4,
      livestreamProvider: null,
      livestreamUrl: null,
      event: createEvent(),
    });

    await service.updateMatch('match-1', { expectedRevision: 3, livestreamProvider: null }, actor);

    expect(tx.sportsMatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ livestreamProvider: null, livestreamUrl: null }),
      }),
    );
    expect(tx.event.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ youtubeCode: null }) }),
    );
  });

  it('updates the backing Event name when a match name is edited', async () => {
    tx.sportsMatch.findFirst.mockResolvedValue({
      id: 'match-1',
      eventId: 'event-1',
      categoryId: 'category-1',
      stageId: null,
      venueId: null,
      homeRegistrationId: null,
      awayRegistrationId: null,
      winnerAdvancesToId: null,
      loserAdvancesToId: null,
      revision: 3,
      livestreamProvider: null,
      livestreamUrl: null,
      event: createEvent(),
      category: {
        id: 'category-1',
        eventGroupId: 'group-1',
        tournamentId: 'tournament-1',
        tournament: { majorEventId: 'major-1' },
      },
    });
    tx.sportsMatch.updateMany.mockResolvedValue({ count: 1 });
    tx.sportsMatch.findUniqueOrThrow.mockResolvedValue({
      id: 'match-1',
      eventId: 'event-1',
      revision: 4,
      event: { ...createEvent(), name: 'Final feminina' },
    });

    await service.updateMatch('match-1', { expectedRevision: 3, name: 'Final feminina' }, actor);

    expect(tx.event.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Final feminina' }) }),
    );
  });

  it('normalizes registration answers and stores a server-derived form snapshot', async () => {
    prisma.sportsCategory.findFirst.mockResolvedValue({
      eventGroupId: 'group-1',
    });
    tx.sportsTeam.findFirst.mockResolvedValue({
      tournamentId: 'tournament-1',
      name: 'Equipe A',
    });
    tx.sportsCategory.findFirst.mockResolvedValue({
      ...createCategory(),
      registrationFormId: 'form-1',
      registrationForm: {
        id: 'form-1',
        name: 'Inscrição',
        elements: [
          {
            id: 'student-id',
            type: 'shortText',
            title: 'Matrícula',
            required: true,
          },
        ],
        updatedAt: new Date('2026-07-01T12:00:00.000Z'),
        deletedAt: null,
      },
    });
    tx.sportsRegistration.findFirst.mockResolvedValue(null);
    tx.sportsRegistration.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: 'registration-1',
      ...data,
      status: SportsRegistrationStatus.APPROVED,
    }));

    await service.createRegistration(
      {
        teamId: 'team-1',
        categoryId: 'category-1',
        formAnswers: [{ elementId: 'student-id', value: '  12345  ' }] as never,
      },
      actor,
    );

    expect(tx.sportsRegistration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        formAnswers: [{ elementId: 'student-id', value: '12345' }],
        formSchemaSnapshot: expect.objectContaining({
          version: 1,
          formId: 'form-1',
          name: 'Inscrição',
          sourceUpdatedAt: '2026-07-01T12:00:00.000Z',
        }),
      }),
    });
  });

  it('rejects registration answers when the category has no form', async () => {
    prisma.sportsCategory.findFirst.mockResolvedValue({
      eventGroupId: 'group-1',
    });
    tx.sportsTeam.findFirst.mockResolvedValue({
      tournamentId: 'tournament-1',
      name: 'Equipe A',
    });
    tx.sportsCategory.findFirst.mockResolvedValue({
      ...createCategory(),
      registrationFormId: null,
      registrationForm: null,
    });
    tx.sportsRegistration.findFirst.mockResolvedValue(null);

    await expect(
      service.createRegistration(
        {
          teamId: 'team-1',
          categoryId: 'category-1',
          formAnswers: [],
        },
        actor,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(tx.sportsRegistration.create).not.toHaveBeenCalled();
  });

  it('validates edited answers against the registration snapshot instead of a drifted form', async () => {
    prisma.sportsRegistration.findFirst.mockResolvedValue({
      id: 'registration-1',
      teamId: 'team-1',
      categoryId: 'category-1',
      status: SportsRegistrationStatus.APPROVED,
      seed: null,
      revision: 2,
      formAnswers: [{ elementId: 'course', value: 'law' }],
      formSchemaSnapshot: {
        version: 1,
        formId: 'form-1',
        elements: [
          {
            id: 'course',
            type: 'singleChoice',
            title: 'Curso',
            required: true,
            options: [{ id: 'law', label: 'Direito' }],
          },
        ],
      },
      category: {
        eventGroupId: 'group-1',
        tournament: { majorEventId: 'major-1' },
      },
    });

    await expect(
      service.updateRegistration(
        'registration-1',
        {
          expectedRevision: 2,
          formAnswers: [{ elementId: 'course', value: 'new-option' }],
        },
        actor,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(tx.sportsRegistration.updateMany).not.toHaveBeenCalled();
  });

  it('creates audited manual overall-score adjustments for a team in the tournament', async () => {
    prisma.sportsTournament.findFirst.mockResolvedValue({
      majorEventId: 'major-1',
    });
    tx.sportsTeam.findFirst.mockResolvedValue({ id: 'team-1' });
    tx.sportsTournamentScoreEntry.create.mockResolvedValue({
      id: 'score-1',
      tournamentId: 'tournament-1',
      categoryId: null,
      teamId: 'team-1',
      sourceMatchId: null,
      source: SportsScoreEntrySource.MANUAL,
      points: 3,
      reason: 'Bônus técnico',
      revision: 1,
    });

    const result = await service.createTournamentScoreEntry(
      {
        tournamentId: 'tournament-1',
        teamId: 'team-1',
        source: SportsScoreEntrySource.MANUAL,
        points: 3,
        reason: 'Bônus técnico',
      },
      actor,
    );

    expect(result.id).toBe('score-1');
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({
          source: SportsScoreEntrySource.MANUAL,
          points: 3,
        }),
      }),
      tx,
    );
  });

  it('rejects an administrative score adjustment masquerading as a match result', async () => {
    prisma.sportsTournament.findFirst.mockResolvedValue({
      majorEventId: 'major-1',
    });

    await expect(
      service.createTournamentScoreEntry(
        {
          tournamentId: 'tournament-1',
          teamId: 'team-1',
          sourceMatchId: 'match-1',
          source: SportsScoreEntrySource.MATCH,
          points: 3,
          reason: 'Resultado',
        },
        actor,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(tx.sportsTournamentScoreEntry.create).not.toHaveBeenCalled();
  });
});

function createCategory() {
  return {
    id: 'category-1',
    tournamentId: 'tournament-1',
    eventGroupId: 'group-1',
    name: 'Futsal masculino',
    sport: SportsPreset.FUTSAL,
    division: 'Masculino',
    format: SportsFormat.SINGLE_ELIMINATION,
    status: SportsCategoryStatus.ACTIVE,
    revision: 1,
    eventGroup: {
      id: 'group-1',
      emoji: '⚽',
    },
    tournament: {
      id: 'tournament-1',
      majorEventId: 'major-1',
      status: SportsTournamentStatus.LIVE,
      scoringMode: SportsScoringMode.BOTH,
      selfSubscriptionEnabled: false,
      allowPlayerMultipleTeams: false,
      revision: 1,
      majorEvent: {
        id: 'major-1',
        publicationState: PublicationState.PUBLISHED,
      },
    },
  };
}

function createEvent() {
  return {
    id: 'event-1',
    name: 'Partida existente',
    startDate: new Date('2026-08-01T12:00:00.000Z'),
    endDate: new Date('2026-08-01T13:00:00.000Z'),
    majorEventId: 'major-1',
    eventGroupId: 'group-1',
    allowSubscription: false,
    sportsMatch: null,
  };
}

function createTransaction() {
  return {
    sportsCategory: {
      findFirst: jest.fn(),
    },
    sportsRegistration: {
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    sportsTeam: {
      findFirst: jest.fn(),
    },
    sportsTournamentScoreEntry: {
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
    },
    sportsVenue: {
      findFirst: jest.fn(),
    },
    sportsStage: {
      findFirst: jest.fn(),
    },
    sportsMatch: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
    },
    sportsOfficialAssignment: {
      updateMany: jest.fn(),
    },
    event: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLogEntry: {
      create: jest.fn(),
    },
  };
}
