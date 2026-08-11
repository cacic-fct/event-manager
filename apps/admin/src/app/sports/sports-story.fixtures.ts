import { fakerPT_BR as faker } from '@faker-js/faker';
import type {
  SportsApplication,
  SportsCategoryRead,
  SportsCategorySummary,
  SportsMatchReview,
  SportsPendingMatchAction,
  SportsRegistrationRead,
  SportsTeamRead,
  SportsTeamSummary,
  SportsTournamentRead,
} from './sports.models';
import { getDefaultSportsEmoji } from '@cacic-fct/shared-data-types/sports-metadata';

faker.seed(20260820);

export const sportsStoryMajorEvent = {
  id: 'major-games-2026',
  name: 'Jogos Universitários 2026',
  emoji: '🏆',
  startDate: '2026-09-12T11:00:00.000Z',
  endDate: '2026-09-20T22:00:00.000Z',
  isPaymentRequired: true,
  publicationState: 'PUBLISHED',
  createdAt: '2026-05-01T12:00:00.000Z',
  majorEventPrices: [],
};

const categoryPresets = [
  ['Futebol feminino', 'SOCCER', 'GROUP_STAGE_ELIMINATION', 'Feminino'],
  ['Tênis individual', 'TENNIS', 'SINGLE_ELIMINATION', 'Livre'],
  ['Basquete masculino', 'BASKETBALL', 'ROUND_ROBIN', 'Masculino'],
  ['League of Legends', 'ESPORTS', 'DOUBLE_ELIMINATION', 'Aberto'],
  ['Xadrez rápido', 'CHESS', 'SWISS', 'Aberto'],
  ['Vôlei misto', 'VOLLEYBALL', 'ROUND_ROBIN', 'Misto'],
  ['Natação 50 m livre', 'SWIMMING', 'CUSTOM', 'Feminino'],
  ['Futsal aberto', 'FUTSAL', 'SINGLE_ELIMINATION', 'Aberto'],
] as const;

export function createAdminSportsCategory(index = 0): SportsCategorySummary {
  const [name, sport, format, division] = categoryPresets[index % categoryPresets.length];
  const periodsEnabled = sport !== 'CHESS' && sport !== 'SWIMMING';
  return {
    id: `category-${index + 1}`,
    tournamentId: 'tournament-1',
    eventGroupId: `group-${index + 1}`,
    eventGroup: {
      id: `group-${index + 1}`,
      emoji: getDefaultSportsEmoji(sport),
    },
    name,
    sport,
    customSportName: null,
    division,
    format,
    status: 'ACTIVE',
    registrationStartDate: '2026-08-01T12:00:00.000Z',
    registrationEndDate: '2026-09-01T23:59:00.000Z',
    minimumRosterSize: sport === 'TENNIS' || sport === 'CHESS' ? 1 : 5,
    maximumRosterSize: sport === 'TENNIS' || sport === 'CHESS' ? 2 : 18,
    maximumCaptains: 2,
    maximumCoaches: 1,
    allowPlayerMultipleTeams: false,
    periodsEnabled,
    maximumPeriods: periodsEnabled ? 5 : null,
    periodLabel: periodsEnabled ? 'Período' : null,
    timerRulesJson: JSON.stringify({
      overallEnabled: true,
      periodEnabled: periodsEnabled,
      periodDurationMs: sport === 'SOCCER' ? 2_700_000 : 600_000,
      allowOvertime: true,
      periodStartOffsetsMs: sport === 'SOCCER' ? [0, 2_700_000] : [0],
    }),
    rulesText: 'Regras públicas revisadas pela organização.',
    scoreRulesJson: '{"minimumDelta":1}',
    overallScoringRulesJson: '{"mode":"NONE","match":{"win":3,"draw":1,"loss":0},"placement":{}}',
    rosterRulesJson: '{"requireApprovedEligibility":true}',
    bracketRulesJson: '{"allowByes":true}',
    standingsRulesJson: '{"winPoints":3,"drawPoints":1}',
    registrationFormId: null,
    revision: 2,
  };
}

export function createAdminSportsTeam(index = 0): SportsTeamSummary {
  faker.seed(20260830 + index);
  return {
    id: `team-${index + 1}`,
    tournamentId: 'tournament-1',
    name: index === 0 ? 'Atlética FCT' : faker.company.name(),
    institution: `Faculdade ${String.fromCharCode(65 + index)}`,
    status: index === 2 ? 'PENDING_APPROVAL' : 'ACTIVE',
    logoUrl: null,
    revision: 3,
    fieldRevisionsJson: '{"name":3,"institution":2}',
  };
}

export function createAdminSportsTournamentRead(
  options: {
    categoryCount?: number;
    teamCount?: number;
    status?: SportsTournamentRead['tournament']['status'];
    selfSubscriptionAllowNoTeam?: boolean;
    selfSubscriptionAllowNoCategory?: boolean;
  } = {},
): SportsTournamentRead {
  const categoryCount = options.categoryCount ?? categoryPresets.length;
  const teamCount = options.teamCount ?? 8;
  const categories = Array.from({ length: categoryCount }, (_, index) => createAdminSportsCategory(index));
  const teams = Array.from({ length: teamCount }, (_, index) => createAdminSportsTeam(index));
  return {
    tournament: {
      id: 'tournament-1',
      majorEventId: sportsStoryMajorEvent.id,
      status: options.status ?? 'LIVE',
      scoringMode: 'BOTH',
      selfSubscriptionEnabled: true,
      selfSubscriptionAllowNoTeam: options.selfSubscriptionAllowNoTeam ?? false,
      selfSubscriptionAllowNoCategory: options.selfSubscriptionAllowNoCategory ?? false,
      allowPlayerMultipleTeams: false,
      revision: 7,
      finishedAt: options.status === 'FINISHED' ? '2026-09-20T22:00:00.000Z' : null,
    },
    categories,
    teams,
    scoreEntries: teams.slice(0, 3).map((team, index) => ({
      id: `score-entry-${index + 1}`,
      tournamentId: 'tournament-1',
      teamId: team.id,
      source: index === 2 ? 'PENALTY' : 'PLACEMENT',
      points: index === 2 ? -2 : 12 - index * 3,
      reason: index === 2 ? 'Penalidade disciplinar' : 'Colocação no vôlei',
      revision: 1,
    })),
    venues: [
      {
        id: 'venue-1',
        tournamentId: 'tournament-1',
        placePresetId: 'place-1',
        name: 'Ginásio Universitário',
        courtLabel: 'Quadra principal',
        capacity: 420,
        notes: 'Entrada pela lateral norte.',
        parentVenueId: null,
        revision: 2,
      },
    ],
    officials: [
      {
        id: 'official-1',
        tournamentId: 'tournament-1',
        categoryId: null,
        matchId: null,
        personId: 'person-official',
        role: 'REFEREE',
        active: true,
        assignedAt: '2026-08-10T12:00:00.000Z',
        revision: 1,
      },
    ],
    teamSummaries: teams.map((team, teamIndex) => ({
      team,
      registrations: categories
        .filter((_, categoryIndex) => (teamIndex + categoryIndex) % 3 !== 2)
        .slice(0, 3)
        .map((category, registrationIndex) => ({
          id: `summary-registration-${team.id}-${registrationIndex + 1}`,
          categoryId: category.id,
          categoryName: category.name,
          categoryEmoji: category.eventGroup?.emoji ?? '🏅',
          status: 'ACTIVE',
        })),
    })),
  };
}

export function createAdminSportsCategoryRead(category = createAdminSportsCategory()): SportsCategoryRead {
  return {
    category,
    registrations: [
      {
        id: 'registration-home',
        teamId: 'team-1',
        categoryId: category.id,
        status: 'ACTIVE',
        seed: 1,
        formAnswersJson: '{}',
        revision: 2,
      },
      {
        id: 'registration-away',
        teamId: 'team-2',
        categoryId: category.id,
        status: 'APPROVED',
        seed: 2,
        formAnswersJson: '{}',
        revision: 1,
      },
    ],
    stages: [
      {
        id: 'stage-1',
        categoryId: category.id,
        name: 'Eliminatórias',
        type: 'ELIMINATION',
        displayOrder: 0,
        generationRevision: 1,
      },
    ],
    matches: [
      {
        id: 'match-1',
        eventId: 'event-match-1',
        event: {
          id: 'event-match-1',
          name: 'Atlética FCT × Faculdade B',
          startDate: '2026-09-13T18:00:00.000Z',
          endDate: '2026-09-13T19:30:00.000Z',
          locationDescription: 'Ginásio Universitário',
        },
        categoryId: category.id,
        stageId: 'stage-1',
        venueId: 'venue-1',
        homeRegistrationId: 'registration-home',
        awayRegistrationId: 'registration-away',
        state: 'LIVE',
        canonicalState: 'CHECK_IN',
        reviewStatus: 'PENDING',
        scoreboard: { homeScore: 2, awayScore: 1 },
        revision: 8,
        roundNumber: 1,
        bracketPosition: 1,
        groupKey: null,
      },
    ],
    standings: [
      {
        id: 'standing-1',
        registrationId: 'registration-home',
        played: 3,
        wins: 3,
        draws: 0,
        losses: 0,
        scoreFor: 9,
        scoreAgainst: 2,
        points: 9,
      },
    ],
    placements: [],
    officials: [],
  };
}

export function createAdminSportsTeamRead(team = createAdminSportsTeam()): SportsTeamRead {
  return {
    team,
    members: [
      {
        id: 'member-1',
        teamId: team.id,
        participantId: 'participant-1',
        status: 'APPROVED',
        revision: 2,
        person: { id: 'person-1', name: 'Ana Beatriz de Souza' },
        categoryAssignments: [
          {
            registrationId: 'registration-home',
            categoryId: 'category-1',
            categoryName: 'Futebol feminino',
            categoryEmoji: '⚽',
          },
          {
            registrationId: 'registration-volleyball',
            categoryId: 'category-2',
            categoryName: 'Vôlei misto',
            categoryEmoji: '🏐',
          },
        ],
      },
      {
        id: 'member-2',
        teamId: team.id,
        participantId: 'participant-2',
        status: 'SUSPENDED',
        revision: 3,
        person: { id: 'person-2', name: 'Bruno Henrique Oliveira' },
        categoryAssignments: [],
      },
    ],
    representatives: [
      {
        id: 'representative-1',
        personId: 'person-representative',
        person: { id: 'person-representative', name: 'Mariana Clara Santos' },
        active: true,
        assignedAt: '2026-08-10T12:00:00.000Z',
      },
    ],
    registrations: [
      {
        id: 'registration-home',
        teamId: team.id,
        categoryId: 'category-1',
        status: 'ACTIVE',
        seed: 1,
        formAnswersJson: '{}',
        revision: 2,
      },
    ],
    changeRequests: [
      {
        id: 'change-1',
        type: 'TEAM_DETAILS',
        status: 'CONFLICT',
        requestRevision: 3,
        baseRevision: 2,
        deltaJson: '{"set":{"institution":"FCT-Unesp, Campus Presidente Prudente"}}',
        reviewMessage: 'O nome da instituição também foi alterado por uma pessoa administradora.',
        updatedAt: '2026-08-19T15:30:00.000Z',
      },
    ],
  };
}

export function createAdminSportsApplications(count = 3): SportsApplication[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `application-${index + 1}`,
    tournamentId: 'tournament-1',
    applicant: {
      personId: `applicant-${index + 1}`,
      name: index === 0 ? 'Camila Rodrigues Pereira' : faker.person.fullName(),
    },
    requestedTeam: index === 2 ? null : createAdminSportsTeam(index),
    categories: [createAdminSportsCategory(index)],
    status: index === 1 ? 'CHANGES_REQUESTED' : 'PENDING',
    participantStatus: 'PENDING',
    paymentStatus: index === 0 ? 'NOT_REQUIRED' : null,
    paymentTier: index === 0 ? 'Estudante' : null,
    imageLicenseAgreementAccepted: index === 0,
    reviewMessage: index === 1 ? 'Confirme a modalidade solicitada.' : null,
    createdAt: new Date(Date.UTC(2026, 7, 18 - index, 14, 0)).toISOString(),
  }));
}

export function createAdminSportsMatchReview(): SportsMatchReview {
  const match = createAdminSportsCategoryRead().matches[0];
  if (!match) {
    throw new Error('The sports story match fixture is missing.');
  }
  return {
    match,
    actions: [
      {
        id: 'action-1',
        type: 'SCORE_DELTA',
        payloadJson: '{"side":"HOME","amount":1}',
        reviewStatus: 'PENDING',
        offline: true,
        authoredAt: '2026-09-13T18:35:00.000Z',
      },
    ],
    rosters: [],
    officials: [],
  };
}

export function createAdminSportsPendingMatchActions(count = 1): SportsPendingMatchAction[] {
  const review = createAdminSportsMatchReview();
  return Array.from({ length: count }, (_, index) => {
    const action = review.actions[0];
    if (!action) {
      throw new Error('The sports story action fixture is missing.');
    }
    return {
      action: {
        ...action,
        id: `action-${index + 1}`,
        matchId: review.match.id,
      },
      match: review.match,
      categoryName: 'Futebol feminino',
      homeTeamName: 'Atlética FCT',
      awayTeamName: 'Faculdade B',
    };
  });
}

export function createAdminSportsRegistrationRead(
  registrationId: 'registration-home' | 'registration-away',
): SportsRegistrationRead {
  const home = registrationId === 'registration-home';
  return {
    registration: {
      id: registrationId,
      teamId: home ? 'team-1' : 'team-2',
      categoryId: 'category-1',
      status: 'ACTIVE',
      seed: home ? 1 : 2,
      formAnswersJson: '{}',
      revision: 2,
    },
    members: Array.from({ length: 5 }, (_, index) => ({
      id: `${registrationId}-member-${index + 1}`,
      registrationId,
      categoryId: 'category-1',
      teamMemberId: `${home ? 'home' : 'away'}-team-member-${index + 1}`,
      role: index === 0 ? 'CAPTAIN' : 'PLAYER',
      eligibility: 'ELIGIBLE',
      person: {
        id: `${home ? 'home' : 'away'}-person-${index + 1}`,
        name: home
          ? ['Ana Souza', 'Bianca Lima', 'Carla Alves', 'Daniela Melo', 'Elisa Reis'][index]
          : ['Fernanda Luz', 'Gabriela Dias', 'Helena Cruz', 'Isabela Paz', 'Joana Leal'][index],
      },
    })),
    rosters: [],
  };
}
