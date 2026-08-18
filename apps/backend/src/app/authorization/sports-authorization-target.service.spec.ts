import type { ResolvedGrantTarget } from './authorization-policy.service';
import { SportsAuthorizationTargetService } from './sports-authorization-target.service';

class SportsAuthorizationTargetHarness extends SportsAuthorizationTargetService {
  readonly eventIds: string[] = [];

  protected async addEventTarget(target: ResolvedGrantTarget, eventId: string): Promise<void> {
    this.eventIds.push(eventId);
    target.eventIds.add(eventId);
  }

  tournament(target: ResolvedGrantTarget, id: string) {
    return this.addSportsTournamentTarget(target, id);
  }

  category(target: ResolvedGrantTarget, id: string) {
    return this.addSportsCategoryTarget(target, id);
  }

  team(target: ResolvedGrantTarget, id: string) {
    return this.addSportsTeamTarget(target, id);
  }

  registration(target: ResolvedGrantTarget, id: string) {
    return this.addSportsRegistrationTarget(target, id);
  }

  match(target: ResolvedGrantTarget, id: string) {
    return this.addSportsMatchTarget(target, id);
  }

  official(target: ResolvedGrantTarget, id: string) {
    return this.addSportsOfficialTarget(target, id);
  }

  changeRequest(target: ResolvedGrantTarget, id: string) {
    return this.addSportsTeamChangeRequestTarget(target, id);
  }

  representative(target: ResolvedGrantTarget, id: string) {
    return this.addSportsTeamRepresentativeTarget(target, id);
  }

  application(target: ResolvedGrantTarget, id: string) {
    return this.addSportsPlayerApplicationTarget(target, id);
  }

  action(target: ResolvedGrantTarget, id: string) {
    return this.addSportsMatchActionTarget(target, id);
  }

  roster(target: ResolvedGrantTarget, id: string) {
    return this.addSportsMatchRosterTarget(target, id);
  }
}

describe('SportsAuthorizationTargetService', () => {
  let prisma: ReturnType<typeof createPrisma>;
  let service: SportsAuthorizationTargetHarness;
  let target: ResolvedGrantTarget;

  beforeEach(() => {
    prisma = createPrisma();
    service = new SportsAuthorizationTargetHarness(prisma as never);
    target = createTarget();
  });

  it('maps tournament, category, team, and registration scopes', async () => {
    prisma.sportsTournament.findUnique.mockResolvedValue({ majorEventId: 'major-1' });
    prisma.sportsCategory.findUnique.mockResolvedValue({
      eventGroupId: 'group-1',
      tournament: { majorEventId: 'major-1' },
    });
    prisma.sportsTeam.findUnique.mockResolvedValue({
      tournament: { majorEventId: 'major-2' },
      registrations: [{ category: { eventGroupId: 'group-2' } }, { category: { eventGroupId: 'group-3' } }],
    });
    prisma.sportsRegistration.findUnique.mockResolvedValue({
      category: { eventGroupId: 'group-4', tournament: { majorEventId: 'major-3' } },
    });

    await service.tournament(target, 'tournament-1');
    await service.category(target, 'category-1');
    await service.team(target, 'team-1');
    await service.registration(target, 'registration-1');

    expect(target.majorEventIds).toEqual(new Set(['major-1', 'major-2', 'major-3']));
    expect(target.eventGroupIds).toEqual(new Set(['group-1', 'group-2', 'group-3', 'group-4']));
  });

  it('leaves targets unchanged when direct sports resources no longer exist', async () => {
    await service.tournament(target, 'missing');
    await service.category(target, 'missing');
    await service.team(target, 'missing');
    await service.registration(target, 'missing');
    await service.match(target, 'missing');

    expect(target).toEqual(createTarget());
    expect(service.eventIds).toEqual([]);
  });

  it('resolves matches through their backing events', async () => {
    prisma.sportsMatch.findUnique.mockResolvedValue({ eventId: 'event-1' });

    await service.match(target, 'match-1');

    expect(service.eventIds).toEqual(['event-1']);
    expect(target.eventIds).toEqual(new Set(['event-1']));
  });

  it.each([
    [{ matchId: 'match-1', categoryId: 'category-1', tournamentId: 'tournament-1' }, 'match'],
    [{ matchId: null, categoryId: 'category-1', tournamentId: 'tournament-1' }, 'category'],
    [{ matchId: null, categoryId: null, tournamentId: 'tournament-1' }, 'tournament'],
  ] as const)('uses the narrowest available official assignment scope', async (assignment, expected) => {
    prisma.sportsOfficialAssignment.findUnique.mockResolvedValue(assignment);
    prisma.sportsMatch.findUnique.mockResolvedValue({ eventId: 'event-1' });
    prisma.sportsCategory.findUnique.mockResolvedValue({
      eventGroupId: 'group-1',
      tournament: { majorEventId: 'major-1' },
    });
    prisma.sportsTournament.findUnique.mockResolvedValue({ majorEventId: 'major-1' });

    await service.official(target, 'official-1');

    expect(prisma.sportsMatch.findUnique).toHaveBeenCalledTimes(expected === 'match' ? 1 : 0);
    expect(prisma.sportsCategory.findUnique).toHaveBeenCalledTimes(expected === 'category' ? 1 : 0);
    expect(prisma.sportsTournament.findUnique).toHaveBeenCalledTimes(expected === 'tournament' ? 1 : 0);
  });

  it('ignores a missing official assignment', async () => {
    await service.official(target, 'missing');
    expect(target).toEqual(createTarget());
  });

  it('maps indirect team resources and ignores missing records', async () => {
    prisma.sportsTeam.findUnique.mockResolvedValue({
      tournament: { majorEventId: 'major-1' },
      registrations: [],
    });
    prisma.sportsTeamChangeRequest.findUnique.mockResolvedValueOnce({ teamId: 'team-1' }).mockResolvedValueOnce(null);
    prisma.sportsTeamRepresentative.findUnique.mockResolvedValueOnce({ teamId: 'team-1' }).mockResolvedValueOnce(null);

    await service.changeRequest(target, 'request-1');
    await service.changeRequest(target, 'missing');
    await service.representative(target, 'representative-1');
    await service.representative(target, 'missing');

    expect(target.majorEventIds).toEqual(new Set(['major-1']));
    expect(prisma.sportsTeam.findUnique).toHaveBeenCalledTimes(2);
  });

  it('maps application tournament and category choices and ignores a missing application', async () => {
    prisma.sportsPlayerApplication.findUnique
      .mockResolvedValueOnce({
        tournamentId: 'tournament-1',
        categoryChoices: [{ category: { eventGroupId: 'group-1' } }, { category: { eventGroupId: 'group-2' } }],
      })
      .mockResolvedValueOnce(null);
    prisma.sportsTournament.findUnique.mockResolvedValue({ majorEventId: 'major-1' });

    await service.application(target, 'application-1');
    await service.application(target, 'missing');

    expect(target.majorEventIds).toEqual(new Set(['major-1']));
    expect(target.eventGroupIds).toEqual(new Set(['group-1', 'group-2']));
  });

  it('maps actions and rosters through their matches and ignores missing records', async () => {
    prisma.sportsMatchAction.findUnique.mockResolvedValueOnce({ matchId: 'match-1' }).mockResolvedValueOnce(null);
    prisma.sportsMatchRoster.findUnique.mockResolvedValueOnce({ matchId: 'match-2' }).mockResolvedValueOnce(null);
    prisma.sportsMatch.findUnique
      .mockResolvedValueOnce({ eventId: 'event-1' })
      .mockResolvedValueOnce({ eventId: 'event-2' });

    await service.action(target, 'action-1');
    await service.action(target, 'missing');
    await service.roster(target, 'roster-1');
    await service.roster(target, 'missing');

    expect(target.eventIds).toEqual(new Set(['event-1', 'event-2']));
  });
});

function createTarget(): ResolvedGrantTarget {
  return {
    eventIds: new Set(),
    majorEventIds: new Set(),
    eventGroupIds: new Set(),
    folderIds: new Set(),
  };
}

function createPrisma() {
  const model = () => ({ findUnique: jest.fn().mockResolvedValue(null) });
  return {
    sportsTournament: model(),
    sportsCategory: model(),
    sportsTeam: model(),
    sportsRegistration: model(),
    sportsMatch: model(),
    sportsOfficialAssignment: model(),
    sportsTeamChangeRequest: model(),
    sportsTeamRepresentative: model(),
    sportsPlayerApplication: model(),
    sportsMatchAction: model(),
    sportsMatchRoster: model(),
  };
}
