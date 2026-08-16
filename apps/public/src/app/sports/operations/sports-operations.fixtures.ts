import { fakerPT_BR as faker } from '@faker-js/faker';
import type {
  CurrentUserTournamentOperations,
  RepresentativeTeamChange,
  RepresentativeTeamWorkspace,
  SportsLineupRead,
  SportsMatchState,
  SportsOperationalMatch,
  SportsOperationsRoster,
  SportsTeamSummary,
} from './sports-operations.types';

const fixtureStart = new Date();
fixtureStart.setDate(fixtureStart.getDate() + 1);
fixtureStart.setHours(19, 0, 0, 0);

const homeTeam: SportsTeamSummary = {
  id: 'team-home',
  name: 'Engenharia Atlética',
  institution: 'FCT-Unesp',
  logoUrl: null,
};

const awayTeam: SportsTeamSummary = {
  id: 'team-away',
  name: 'Direito XI',
  institution: 'Universidade Estadual',
  logoUrl: null,
};

function roster(team: SportsTeamSummary, registrationId: string, side: 'home' | 'away'): SportsOperationsRoster {
  faker.seed(side === 'home' ? 20260811 : 20260812);
  return {
    id: `roster-${side}`,
    registrationId,
    revision: 2,
    status: 'SUBMITTED',
    team,
    entries: Array.from({ length: 5 }, (_, index) => ({
      id: `${side}-athlete-${index + 1}`,
      name:
        index === 0 ? (side === 'home' ? 'Ana Beatriz de Souza' : 'Bruno Henrique Oliveira') : faker.person.fullName(),
      role: index === 0 ? ('CAPTAIN' as const) : ('PLAYER' as const),
      shirtNumber: String(index + (side === 'home' ? 7 : 10)),
      status: 'APPROVED',
      checkedInAt: index < 2 ? new Date(fixtureStart.getTime() - (8 - index) * 60_000).toISOString() : null,
    })),
  };
}

export function createRepresentativeTeamWorkspace(
  status: RepresentativeTeamChange['status'] = 'PENDING',
): RepresentativeTeamWorkspace {
  return {
    team: homeTeam,
    teamRevision: 5,
    members: [
      {
        id: 'member-1',
        name: 'Ana Beatriz de Souza',
        status: 'APPROVED',
        revision: 2,
        categoryRoles: [
          {
            registrationId: 'registration-home',
            categoryId: 'futsal-open',
            categoryName: 'Futsal',
            role: 'CAPTAIN',
            eligibility: 'ELIGIBLE',
          },
        ],
      },
      {
        id: 'member-2',
        name: 'Carlos Eduardo Lima',
        status: 'APPROVED',
        revision: 1,
        categoryRoles: [
          {
            registrationId: 'registration-home',
            categoryId: 'futsal-open',
            categoryName: 'Futsal',
            role: 'PLAYER',
            eligibility: 'ELIGIBLE',
          },
        ],
      },
    ],
    registrations: [
      {
        id: 'registration-home',
        categoryId: 'futsal-open',
        categoryName: 'Futsal',
        categoryEmoji: '⚽',
        status: 'APPROVED',
      },
    ],
    matches: [
      {
        id: 'match-story',
        eventId: 'event-story',
        state: 'SCHEDULED',
        startDate: fixtureStart.toISOString(),
        endDate: new Date(fixtureStart.getTime() + 90 * 60_000).toISOString(),
        homeRegistrationId: 'registration-home',
        awayRegistrationId: 'registration-away',
        categoryId: 'futsal-open',
        categoryName: 'Futsal',
        categoryEmoji: '⚽',
        homeTeam,
        awayTeam,
      },
      {
        id: 'match-finished',
        eventId: 'event-finished',
        state: 'AWAITING_REVIEW',
        startDate: new Date(fixtureStart.getTime() - 2 * 60 * 60_000).toISOString(),
        endDate: new Date(fixtureStart.getTime() - 30 * 60_000).toISOString(),
        homeRegistrationId: 'registration-home',
        awayRegistrationId: 'registration-third',
        categoryId: 'futsal-open',
        categoryName: 'Futsal',
        categoryEmoji: '⚽',
        homeTeam,
        awayTeam: { id: 'team-third', name: 'Medicina Prudente', institution: 'UNOESTE', logoUrl: null },
      },
    ],
    joinQueueCount: 1,
    queuedChanges: [
      {
        id: 'team-change-profile',
        type: 'TEAM_DETAILS',
        status,
        requestRevision: 3,
        baseRevision: 4,
        deltaJson: JSON.stringify({
          set: {
            name: 'Engenharia Atlética Renovada',
            institution: 'FCT-Unesp - Campus Presidente Prudente',
          },
        }),
        reviewMessage:
          status === 'CHANGES_REQUESTED'
            ? 'Confirme o nome oficial da instituição.'
            : status === 'CONFLICT'
              ? 'A instituição também foi alterada por uma pessoa administradora.'
              : null,
        identityHints: [],
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'team-change-member',
        type: 'MEMBER_ADD',
        status: 'PENDING',
        requestRevision: 1,
        baseRevision: 5,
        deltaJson: '{}',
        reviewMessage: null,
        identityHints: [
          {
            clientKey: 'identity-1',
            type: 'EMAIL',
            displayHint: 'a•••••@example.com',
          },
        ],
        updatedAt: new Date().toISOString(),
      },
    ],
  };
}

export function createSportsLineupRead(
  options: {
    empty?: boolean;
    selected?: boolean;
  } = {},
): SportsLineupRead {
  const eligibleMembers = options.empty
    ? []
    : [
        {
          registrationMemberId: 'member-1',
          name: 'Ana Beatriz de Souza',
          role: 'CAPTAIN' as const,
          shirtNumber: '10',
        },
        {
          registrationMemberId: 'member-2',
          name: 'Carlos Eduardo Lima',
          role: 'PLAYER' as const,
          shirtNumber: '7',
        },
        {
          registrationMemberId: 'member-3',
          name: 'Joana Vitória de Almeida',
          role: 'PLAYER' as const,
          shirtNumber: '3',
        },
        {
          registrationMemberId: 'member-4',
          name: 'Marcos Vinícius Pereira',
          role: 'COACH' as const,
          shirtNumber: null,
        },
      ];
  return {
    matchId: 'match-story',
    matchRevision: 8,
    registrationId: 'registration-home',
    homeRegistrationId: 'registration-home',
    awayRegistrationId: 'registration-away',
    eligibleMembers,
    roster: options.empty
      ? null
      : {
          id: 'roster-home',
          revision: 3,
          status: 'SUBMITTED',
          entries:
            options.selected === false
              ? []
              : eligibleMembers.slice(0, 2).map((member, index) => ({
                  id: `roster-entry-${index + 1}`,
                  registrationMemberId: member.registrationMemberId,
                  role: member.role,
                  status: 'APPROVED',
                  checkedInAt: null,
                  shirtNumber: member.shirtNumber,
                })),
        },
  };
}

export function createCurrentUserTournamentOperations(
  options: {
    paymentRequired?: boolean;
    requiresImageLicenseAgreement?: boolean;
    imageLicenseAgreementAccepted?: boolean;
    empty?: boolean;
    allowNoTeam?: boolean;
    allowNoCategory?: boolean;
  } = {},
): CurrentUserTournamentOperations {
  return {
    imageLicenseAgreementAccepted: options.imageLicenseAgreementAccepted ?? false,
    tournament: {
      id: 'interfct-2026',
      name: 'InterFCT 2026',
      emoji: '🏆',
      isPaymentRequired: options.paymentRequired ?? true,
      requiresImageLicenseAgreement: options.requiresImageLicenseAgreement ?? true,
      selfSubscriptionAllowNoTeam: options.allowNoTeam ?? false,
      selfSubscriptionAllowNoCategory: options.allowNoCategory ?? false,
      paymentTiers:
        options.paymentRequired === false
          ? []
          : [
              { id: 'student', name: 'Estudante', value: 2500 },
              { id: 'community', name: 'Comunidade externa', value: 4500 },
            ],
      teams: options.empty
        ? []
        : [homeTeam, awayTeam, { id: 'team-third', name: 'Medicina Prudente', institution: 'UNOESTE', logoUrl: null }],
      categories: options.empty
        ? []
        : [
            { id: 'futsal-open', name: 'Futsal', emoji: '⚽', division: 'Aberto' },
            { id: 'volleyball-mixed', name: 'Vôlei', emoji: '🏐', division: 'Misto' },
            { id: 'chess-open', name: 'Xadrez rápido', emoji: '♟️', division: 'Aberto' },
          ],
    },
  };
}

export function createSportsOperationalMatch(
  state: SportsMatchState = 'LIVE',
  overrides: Partial<SportsOperationalMatch> = {},
): SportsOperationalMatch {
  const active = state === 'LIVE' || state === 'PAUSED';
  const completed = state === 'FINISHED' || state === 'DRAW';
  const homeRegistrationId = 'registration-home';
  const awayRegistrationId = 'registration-away';
  return {
    id: 'match-story',
    eventId: 'event-story',
    categoryId: 'category-story',
    revision: 7,
    homeRegistrationId,
    awayRegistrationId,
    homeTeam,
    awayTeam,
    state,
    scoreboard: {
      homeScore: active || completed || state === 'AWAITING_REVIEW' ? 2 : 0,
      awayScore: active || completed || state === 'AWAITING_REVIEW' ? 1 : 0,
      activePeriod: active ? 2 : null,
      periods:
        active || completed || state === 'AWAITING_REVIEW'
          ? [
              { number: 1, label: '1º tempo', homeScore: 1, awayScore: 1, completed: true },
              {
                number: 2,
                label: '2º tempo',
                homeScore: 1,
                awayScore: 0,
                completed: !active,
              },
            ]
          : [],
    },
    timerStartedAt: state === 'LIVE' ? new Date(Date.now() - 38 * 60_000).toISOString() : null,
    timerPausedAt: state === 'PAUSED' ? new Date().toISOString() : null,
    elapsedBeforePauseMs: state === 'PAUSED' ? 38 * 60_000 : 0,
    periodTimers:
      active || completed || state === 'AWAITING_REVIEW'
        ? [
            {
              periodNumber: 1,
              startedAtUnixMs: null,
              pausedAtUnixMs: fixtureStart.getTime() + 47 * 60_000,
              elapsedBeforePauseMs: 47 * 60_000,
              scheduledStartOffsetMs: 0,
              capMs: 45 * 60_000,
              allowOvertime: true,
            },
            {
              periodNumber: 2,
              startedAtUnixMs: state === 'LIVE' ? Date.now() - 8 * 60_000 : null,
              pausedAtUnixMs: state === 'PAUSED' ? Date.now() : null,
              elapsedBeforePauseMs: state === 'PAUSED' ? 8 * 60_000 : 0,
              scheduledStartOffsetMs: 45 * 60_000,
              capMs: 45 * 60_000,
              allowOvertime: true,
            },
          ]
        : [],
    overallTimerEnabled: true,
    periodTimerEnabled: true,
    timerPeriodDurationMs: 45 * 60_000,
    timerPeriodStartOffsetsMs: [0, 45 * 60_000],
    timerAllowOvertime: true,
    schedule: {
      startDate: fixtureStart.toISOString(),
      endDate: new Date(fixtureStart.getTime() + 90 * 60_000).toISOString(),
      venueName: 'Ginásio central',
      courtLabel: 'Quadra 1',
      locationDescription: 'Campus universitário',
    },
    rosters: [roster(homeTeam, homeRegistrationId, 'home'), roster(awayTeam, awayRegistrationId, 'away')],
    officials: [
      { id: 'official-referee', name: 'Mariana S.', role: 'REFEREE', checkedInAt: null },
      { id: 'official-intermediator', name: 'Carlos O.', role: 'INTERMEDIATOR', checkedInAt: null },
      { id: 'official-scorekeeper', name: 'Joana P.', role: 'SCOREKEEPER', checkedInAt: null },
    ],
    readiness: { ready: true, issues: [] },
    notes: 'Em caso de atendimento, pause o cronômetro e registre a ocorrência.',
    occurrencesJson:
      active || completed
        ? JSON.stringify([
            {
              occurrenceId: 'occurrence-story-1',
              kind: 'SUBSTITUTION',
              note: 'Camisa 7 saiu e camisa 12 entrou aos 18 minutos.',
              authoredAt: new Date(fixtureStart.getTime() + 18 * 60_000).toISOString(),
            },
          ])
        : '[]',
    ...overrides,
  };
}

export function createLongNameOperationalMatch(state: SportsMatchState = 'CHECK_IN'): SportsOperationalMatch {
  return createSportsOperationalMatch(state, {
    homeTeam: {
      ...homeTeam,
      name: 'Associação Atlética Acadêmica de Engenharia de Biotecnologia',
    },
    awayTeam: {
      ...awayTeam,
      name: 'Centro Acadêmico de Ciências Jurídicas e Sociais',
    },
  });
}
