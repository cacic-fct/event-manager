import { BadRequestException } from '@nestjs/common';
import { SportsRosterRole } from '@prisma/client';
import {
  sportsAdminAuditRecords,
  sportsAdminVenueRecord,
  sportsGroupStageRecord,
  sportsTournamentParticipantMembershipRecord,
} from '../testing/sports-backend.fixtures';
import { SportsAdminLookupService } from './sports-admin-lookup.service';

class TestSportsAdminLookupService extends SportsAdminLookupService {
  registration(tx: ReturnType<typeof createTransaction>, registrationId: string | null, categoryId = 'category-1') {
    return this.findRegistration(tx as never, registrationId, categoryId);
  }

  venue(tx: ReturnType<typeof createTransaction>, venueId: string | null, tournamentId = 'tournament-1') {
    return this.findVenue(tx as never, venueId, tournamentId);
  }

  stage(tx: ReturnType<typeof createTransaction>, stageId: string | null, categoryId = 'category-1') {
    return this.findStage(tx as never, stageId, categoryId);
  }

  roleLimit(
    tx: ReturnType<typeof createTransaction>,
    category: { id: string; maximumCaptains: number | null; maximumCoaches: number | null },
    role: SportsRosterRole,
  ) {
    return this.assertRoleLimit(tx as never, category, 'registration-1', role);
  }

  crossTeam(tx: ReturnType<typeof createTransaction>, tournamentId = 'tournament-1') {
    return this.hasCrossTeamParticipants(tx as never, tournamentId);
  }
}

describe('SportsAdminLookupService', () => {
  let tx: ReturnType<typeof createTransaction>;
  let service: TestSportsAdminLookupService;

  beforeEach(() => {
    tx = createTransaction();
    service = new TestSportsAdminLookupService({} as never, {} as never, {} as never, {} as never);
  });

  it('skips optional registration, venue, and stage lookups', async () => {
    await expect(service.registration(tx, null)).resolves.toBeNull();
    await expect(service.venue(tx, null)).resolves.toBeNull();
    await expect(service.stage(tx, null)).resolves.toBeNull();
    expect(tx.sportsRegistration.findFirst).not.toHaveBeenCalled();
    expect(tx.sportsVenue.findFirst).not.toHaveBeenCalled();
    expect(tx.sportsStage.findFirst).not.toHaveBeenCalled();
  });

  it('returns only an approved registration in the requested category', async () => {
    const registration = { ...sportsAdminAuditRecords().registration, team: { name: 'Equipe Azul' } };
    tx.sportsRegistration.findFirst.mockResolvedValue(registration);

    await expect(service.registration(tx, 'registration-1')).resolves.toEqual(registration);
    expect(tx.sportsRegistration.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'registration-1',
        categoryId: 'category-1',
        deletedAt: null,
        status: { in: ['APPROVED', 'ACTIVE'] },
      },
      include: { team: { select: { name: true } } },
    });
  });

  it('rejects a registration outside the approved category scope', async () => {
    tx.sportsRegistration.findFirst.mockResolvedValue(null);
    await expect(service.registration(tx, 'registration-other')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns a venue with its base place only from the requested tournament', async () => {
    const venue = sportsAdminVenueRecord();
    tx.sportsVenue.findFirst.mockResolvedValue(venue);

    await expect(service.venue(tx, 'venue-1')).resolves.toEqual(venue);
    expect(tx.sportsVenue.findFirst).toHaveBeenCalledWith({
      where: { id: 'venue-1', tournamentId: 'tournament-1', deletedAt: null },
      include: { placePreset: true },
    });
  });

  it('rejects a venue outside the tournament', async () => {
    tx.sportsVenue.findFirst.mockResolvedValue(null);
    await expect(service.venue(tx, 'venue-other')).rejects.toThrow(
      'O local selecionado não pertence ao torneio.',
    );
  });

  it('returns a stage only from the requested category', async () => {
    const stage = sportsGroupStageRecord();
    tx.sportsStage.findFirst.mockResolvedValue(stage);

    await expect(service.stage(tx, 'group-stage-a')).resolves.toEqual(stage);
    expect(tx.sportsStage.findFirst).toHaveBeenCalledWith({
      where: { id: 'group-stage-a', categoryId: 'category-1', deletedAt: null },
    });
  });

  it('rejects a stage outside the category', async () => {
    tx.sportsStage.findFirst.mockResolvedValue(null);
    await expect(service.stage(tx, 'stage-other')).rejects.toThrow(
      'A etapa selecionada não pertence à modalidade.',
    );
  });

  it.each([
    [SportsRosterRole.CAPTAIN, 1, 'A equipe atingiu o limite de capitães.'],
    [SportsRosterRole.COACH, 2, 'A equipe atingiu o limite de técnicos.'],
  ])('enforces %s assignment limits', async (role, count, message) => {
    tx.sportsRegistrationMember.count.mockResolvedValue(count);
    const category = { id: 'category-1', maximumCaptains: 1, maximumCoaches: 2 };

    await expect(service.roleLimit(tx, category, role)).rejects.toThrow(message);
  });

  it('allows roles below their limit and skips unlimited player counts', async () => {
    const category = { id: 'category-1', maximumCaptains: 2, maximumCoaches: null };
    tx.sportsRegistrationMember.count.mockResolvedValue(1);

    await expect(service.roleLimit(tx, category, SportsRosterRole.CAPTAIN)).resolves.toBeUndefined();
    await expect(service.roleLimit(tx, category, SportsRosterRole.COACH)).resolves.toBeUndefined();
    await expect(service.roleLimit(tx, category, SportsRosterRole.PLAYER)).resolves.toBeUndefined();
    expect(tx.sportsRegistrationMember.count).toHaveBeenCalledTimes(1);
  });

  it('detects participants assigned across distinct teams', async () => {
    tx.sportsTournamentParticipant.findMany.mockResolvedValue([
      sportsTournamentParticipantMembershipRecord(['team-1']),
      sportsTournamentParticipantMembershipRecord(['team-1', 'team-2']),
    ]);

    await expect(service.crossTeam(tx)).resolves.toBe(true);
    expect(tx.sportsTournamentParticipant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tournamentId: 'tournament-1', deletedAt: null }) }),
    );
  });

  it('ignores duplicate memberships in the same team', async () => {
    tx.sportsTournamentParticipant.findMany.mockResolvedValue([
      sportsTournamentParticipantMembershipRecord(['team-1', 'team-1']),
    ]);
    await expect(service.crossTeam(tx)).resolves.toBe(false);
  });
});

function createTransaction() {
  return {
    sportsRegistration: { findFirst: jest.fn() },
    sportsVenue: { findFirst: jest.fn() },
    sportsStage: { findFirst: jest.fn() },
    sportsRegistrationMember: { count: jest.fn() },
    sportsTournamentParticipant: { findMany: jest.fn() },
  };
}
