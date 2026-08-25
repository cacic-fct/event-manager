import {
  AuditLogActorType,
  PublicationState,
  SportsCategoryStatus,
  SportsMatchActionType,
  SportsMatchState,
  SportsRegistrationStatus,
  SportsReviewStatus,
  SportsRosterRole,
  SportsRosterStatus,
  SportsScoreEntrySource,
  SportsTeamMemberStatus,
  SportsTeamStatus,
  SportsTournamentStatus,
} from '@prisma/client';
import { SportsMatchCommandActor, SportsMatchCommandInput } from '../operations/sports-match-operation.service';
import { SportsProjectionAction } from '../operations/sports-match-projector';

export const SPORTS_TEST_NOW = new Date('2026-07-29T12:00:00.000Z');

export function sportsTestDate(offsetMilliseconds = 0): Date {
  return new Date(Date.now() + offsetMilliseconds);
}

export function sportsProjectionAction(overrides: Partial<SportsProjectionAction> = {}): SportsProjectionAction {
  return {
    type: SportsMatchActionType.START,
    payload: {},
    authoredAt: SPORTS_TEST_NOW,
    reviewStatus: SportsReviewStatus.APPROVED,
    ...overrides,
  };
}

export function sportsMatchCommand(overrides: Partial<SportsMatchCommandInput> = {}): SportsMatchCommandInput {
  return {
    clientId: 'offline_action_0001',
    matchId: 'match-1',
    baseRevision: 1,
    type: SportsMatchActionType.START,
    payload: {},
    authoredAt: SPORTS_TEST_NOW,
    offline: true,
    ...overrides,
  };
}

export function sportsOfficialActor(overrides: Partial<SportsMatchCommandActor> = {}): SportsMatchCommandActor {
  return {
    personId: 'official-person-1',
    userId: 'official-user-1',
    role: 'REFEREE',
    kind: 'OFFICIAL',
    auditActor: {
      id: 'official-person-1',
      name: 'Árbitro de Teste',
      type: AuditLogActorType.USER,
    },
    ...overrides,
  };
}

export function sportsMatchRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'match-1',
    eventId: 'event-1',
    categoryId: 'category-1',
    revision: 1,
    operationSequence: 0,
    state: SportsMatchState.SCHEDULED,
    canonicalState: SportsMatchState.SCHEDULED,
    reviewStatus: SportsReviewStatus.NOT_REQUIRED,
    homeRegistrationId: 'registration-home',
    awayRegistrationId: 'registration-away',
    scoreboard: {
      home: 0,
      away: 0,
      periods: [],
      activePeriodNumber: null,
    },
    category: {
      deletedAt: null,
      eventGroupId: 'event-group-1',
      status: SportsCategoryStatus.ACTIVE,
      maximumPeriods: 4,
      periodLabel: 'Período',
      tournament: {
        id: 'tournament-1',
        majorEventId: 'major-event-1',
        deletedAt: null,
        status: SportsTournamentStatus.LIVE,
        majorEvent: {
          deletedAt: null,
          publicationState: PublicationState.PUBLISHED,
        },
      },
    },
    event: {
      deletedAt: null,
      isPubliclyListed: true,
      publicationState: PublicationState.PUBLISHED,
    },
    actions: [],
    rosters: [],
    ...overrides,
  };
}

export function sportsPublicTeamRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'team-home',
    name: 'Equipe Azul',
    institution: 'FCT',
    logoSha256: 'logo-sha256',
    ...overrides,
  };
}

export function sportsPublicMatchRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const startDate = sportsTestDate(60 * 60_000);
  const endDate = sportsTestDate(2 * 60 * 60_000);
  return {
    id: 'match-1',
    eventId: 'event-1',
    state: SportsMatchState.SCHEDULED,
    categoryId: 'category-1',
    stageId: 'stage-1',
    homeRegistrationId: 'registration-home',
    homeRegistration: { team: sportsPublicTeamRecord() },
    awayRegistrationId: 'registration-away',
    awayRegistration: {
      team: sportsPublicTeamRecord({ id: 'team-away', name: 'Equipe Verde', institution: null, logoSha256: null }),
    },
    roundNumber: 1,
    bracketPosition: 1,
    groupKey: 'A',
    livestreamProvider: null,
    livestreamUrl: null,
    event: {
      startDate,
      endDate,
      locationDescription: 'Campus',
      latitude: -22,
      longitude: -51,
    },
    venue: { name: 'Ginásio', courtLabel: 'Quadra 1' },
    category: {
      maximumPeriods: 2,
      periodLabel: 'Tempo',
      periodsEnabled: true,
      timerRules: {},
      scoreRules: {},
    },
    rosters: [],
    actions: [],
    ...overrides,
  };
}

export function sportsPublicTournamentRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'tournament-1',
    majorEventId: 'major-event-1',
    selfSubscriptionEnabled: true,
    selfSubscriptionAllowNoTeam: false,
    selfSubscriptionAllowNoCategory: false,
    majorEvent: {
      name: 'Jogos Universitários',
      emoji: '🏆',
      description: 'Competição pública',
      startDate: sportsTestDate(24 * 60 * 60_000),
      endDate: sportsTestDate(3 * 24 * 60 * 60_000),
      requiresImageLicenseAgreement: true,
      isPaymentRequired: true,
      majorEventPrices: [
        {
          tiers: [{ id: 'student', name: 'Estudante', value: 2500, includesSportsRegistration: true }],
        },
      ],
    },
    ...overrides,
  };
}

export function sportsCachedPublicTournament(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const startDate = sportsTestDate(60 * 60_000).toISOString();
  const endDate = sportsTestDate(2 * 60 * 60_000).toISOString();
  return {
    id: 'tournament-1',
    startDate,
    endDate,
    matches: [sportsCachedPublicMatch()],
    categories: [{ matches: [sportsCachedPublicMatch()], brackets: [{ matches: [sportsCachedPublicMatch()] }] }],
    ...overrides,
  };
}

export function sportsCachedPublicMatch(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const startDate = sportsTestDate(60 * 60_000).toISOString();
  const endDate = sportsTestDate(2 * 60 * 60_000).toISOString();
  return {
    schedule: { startDate, endDate },
    timerStartedAt: startDate,
    timerPausedAt: endDate,
    ...overrides,
  };
}

export function sportsApprovedRosterRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'source-roster',
    entries: [
      {
        registrationMemberId: 'member-1',
        role: 'PLAYER',
        shirtNumber: '10',
        roleMetadata: null,
      },
      {
        registrationMemberId: 'member-2',
        role: 'PLAYER',
        shirtNumber: '1',
        roleMetadata: { position: 'GOALKEEPER' },
      },
    ],
    ...overrides,
  };
}

export function sportsRosterWriteInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    matchId: 'match-1',
    registrationId: 'registration-home',
    entries: [
      {
        registrationMemberId: 'member-player',
        role: SportsRosterRole.PLAYER,
        shirtNumber: '10',
      },
      {
        registrationMemberId: 'member-coach',
        role: SportsRosterRole.COACH,
        roleMetadata: { certification: 'Nível 1' },
      },
    ],
    ...overrides,
  };
}

export function sportsRosterPersistenceMatch(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'match-1',
    eventId: 'event-1',
    categoryId: 'category-1',
    homeRegistrationId: 'registration-home',
    awayRegistrationId: 'registration-away',
    state: SportsMatchState.SCHEDULED,
    category: {
      id: 'category-1',
      eventGroupId: 'event-group-1',
      maximumRosterSize: 12,
      tournament: { majorEventId: 'major-event-1' },
    },
    ...overrides,
  };
}

export function sportsRosterPersistenceRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'roster-1',
    matchId: 'match-1',
    registrationId: 'registration-home',
    status: SportsRosterStatus.SUBMITTED,
    revision: 1,
    entries: [{ id: 'entry-old', registrationMemberId: 'member-player' }],
    ...overrides,
  };
}

export function sportsProjectedOutcome(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    state: SportsMatchState.SCHEDULED,
    scoreboard: {
      home: 1,
      away: 0,
      activePeriodNumber: 1,
      periods: [{ number: 1, label: 'Tempo 1', home: 1, away: 0, closed: false }],
    },
    timerStartedAt: null,
    timerPausedAt: null,
    elapsedBeforePauseMs: 0,
    ...overrides,
  };
}

export function sportsMatchProjectionContext(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    homeRegistrationId: 'registration-home',
    awayRegistrationId: 'registration-away',
    category: {
      maximumPeriods: 2,
      periodLabel: 'Tempo',
      periodsEnabled: true,
      timerRules: {},
      scoreRules: {},
    },
    ...overrides,
  };
}

export function sportsPublicRosterRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    matchId: 'match-1',
    registration: { team: sportsPublicTeamRecord() },
    entries: [
      {
        role: 'PLAYER',
        registrationMember: {
          category: { athleteIdentifierMode: 'NAME' },
          shirtNumber: null,
          teamMember: { participant: { person: { name: 'Ana Beatriz de Souza' } } },
        },
      },
    ],
    ...overrides,
  };
}

export function sportsPublicOfficialAssignmentRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tournamentId: 'tournament-1',
    categoryId: null,
    matchId: null,
    role: 'REFEREE',
    person: { name: 'Carlos Eduardo Silva' },
    ...overrides,
  };
}

export function sportsCheckInUploader(overrides: Record<string, string> = {}) {
  return {
    personId: 'uploader-person',
    userId: 'uploader-user',
    role: 'ADMIN',
    ...overrides,
  };
}

export function sportsAdminAuditRecords() {
  return {
    tournament: {
      id: 'tournament-1',
      majorEventId: 'major-event-1',
      status: SportsTournamentStatus.LIVE,
      registrationStartDate: null,
      registrationEndDate: null,
      scoringMode: 'BY_CATEGORY',
      selfSubscriptionEnabled: true,
      selfSubscriptionAllowNoTeam: false,
      selfSubscriptionAllowNoCategory: false,
      allowPlayerMultipleTeams: false,
      revision: 2,
    },
    category: {
      id: 'category-1',
      tournamentId: 'tournament-1',
      eventGroupId: 'event-group-1',
      name: 'Futsal',
      sport: 'FUTSAL',
      division: null,
      format: 'SINGLE_ELIMINATION',
      status: SportsCategoryStatus.ACTIVE,
      revision: 2,
    },
    team: {
      id: 'team-1',
      tournamentId: 'tournament-1',
      name: 'Equipe Azul',
      institution: 'FCT',
      status: 'ACTIVE',
      revision: 2,
    },
    registration: {
      id: 'registration-1',
      teamId: 'team-1',
      categoryId: 'category-1',
      status: 'APPROVED',
      seed: 1,
      revision: 2,
    },
    official: {
      id: 'official-1',
      tournamentId: 'tournament-1',
      categoryId: null,
      matchId: null,
      personId: 'person-1',
      role: 'REFEREE',
      active: true,
      revision: 2,
    },
    scoreEntry: {
      id: 'score-entry-1',
      tournamentId: 'tournament-1',
      categoryId: 'category-1',
      teamId: 'team-1',
      sourceMatchId: 'match-1',
      source: 'MANUAL',
      points: 3,
      reason: 'Vitória',
      revision: 2,
    },
    match: {
      id: 'match-1',
      eventId: 'event-1',
      categoryId: 'category-1',
      state: SportsMatchState.SCHEDULED,
      reviewStatus: SportsReviewStatus.NOT_REQUIRED,
      revision: 2,
    },
  };
}

export function sportsGroupStageRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'group-stage-a',
    settings: { groupKey: 'A' },
    standings: [
      { registrationId: 'registration-a1', rank: 1 },
      { registrationId: 'registration-a2', rank: 2 },
    ],
    matches: [
      {
        id: 'group-match-a1',
        state: SportsMatchState.FINISHED,
        canonicalState: SportsMatchState.FINISHED,
        reviewStatus: SportsReviewStatus.APPROVED,
        homeRegistrationId: 'registration-a1',
        awayRegistrationId: 'registration-a2',
        winnerAdvancesToId: null,
      },
    ],
    ...overrides,
  };
}

export function sportsQualifierMatchRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'elimination-match-1',
    categoryId: 'category-1',
    stageId: 'elimination-stage',
    revision: 1,
    state: SportsMatchState.SCHEDULED,
    canonicalState: SportsMatchState.SCHEDULED,
    homeRegistrationId: null,
    awayRegistrationId: null,
    category: { tournamentId: 'tournament-1' },
    event: {
      deletedAt: null,
      isPubliclyListed: true,
      publicationState: PublicationState.PUBLISHED,
    },
    ...overrides,
  };
}

export function sportsQualifierEliminationStageRecord(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'elimination-stage',
    settings: {
      qualifierSlotsByMatch: {
        'elimination-match-1': {
          home: { type: 'GROUP_POSITION', groupKey: 'A', groupPosition: 1 },
          away: { type: 'GROUP_POSITION', groupKey: 'A', groupPosition: 2 },
        },
      },
    },
    standings: [],
    matches: [sportsQualifierMatchRecord()],
    ...overrides,
  };
}

export function sportsBracketPersistenceCategory(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'category-1',
    name: 'Futsal',
    eventGroupId: 'event-group-1',
    eventGroup: { emoji: '⚽' },
    bracketRules: {},
    standingsRules: {},
    tournament: {
      majorEventId: 'major-event-1',
      majorEvent: {
        startDate: sportsTestDate(24 * 60 * 60_000),
        endDate: sportsTestDate(2 * 24 * 60 * 60_000),
        publicationState: PublicationState.DRAFT,
      },
    },
    ...overrides,
  };
}

export function sportsBracketParticipants(count = 4): Array<{ registrationId: string; seed: number }> {
  return Array.from({ length: count }, (_, index) => ({
    registrationId: `registration-${index + 1}`,
    seed: index + 1,
  }));
}

export function sportsAdminTeamRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'team-1',
    tournamentId: 'tournament-1',
    name: 'Equipe Azul',
    institution: 'FCT',
    status: SportsTeamStatus.ACTIVE,
    revision: 2,
    fieldRevisions: { name: 1, institution: 1, logo: 1 },
    deletedAt: null,
    tournament: { majorEventId: 'major-event-1' },
    ...overrides,
  };
}

export function sportsAdminTeamMemberRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'member-1',
    teamId: 'team-1',
    participantId: 'participant-1',
    status: SportsTeamMemberStatus.APPROVED,
    revision: 1,
    approvedAt: sportsTestDate(-60_000),
    approvedById: 'actor-original',
    deletedAt: null,
    participant: { person: { name: 'Ana Silva' } },
    team: {
      id: 'team-1',
      name: 'Equipe Azul',
      tournament: { majorEventId: 'major-event-1' },
    },
    ...overrides,
  };
}

export function sportsAdminRepresentativeRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'representative-1',
    teamId: 'team-1',
    personId: 'person-1',
    active: true,
    revokedAt: null,
    team: {
      id: 'team-1',
      name: 'Equipe Azul',
      tournament: { majorEventId: 'major-event-1' },
    },
    ...overrides,
  };
}

export function sportsAdminScoreEntryRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'score-entry-1',
    tournamentId: 'tournament-1',
    categoryId: 'category-1',
    teamId: 'team-1',
    sourceMatchId: null,
    source: SportsScoreEntrySource.MANUAL,
    points: 3,
    reason: 'Ajuste administrativo',
    revision: 2,
    deletedAt: null,
    tournament: { majorEventId: 'major-event-1' },
    ...overrides,
  };
}

export function sportsAdminRegistrationCategory(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'category-1',
    tournamentId: 'tournament-1',
    eventGroupId: 'event-group-1',
    name: 'Futsal',
    maximumCaptains: 1,
    maximumCoaches: 2,
    registrationFormId: null,
    registrationForm: null,
    tournament: { majorEventId: 'major-event-1' },
    ...overrides,
  };
}

export function sportsAdminRegistrationRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'registration-1',
    teamId: 'team-1',
    categoryId: 'category-1',
    status: SportsRegistrationStatus.APPROVED,
    seed: 1,
    revision: 2,
    formAnswers: null,
    formSchemaSnapshot: null,
    deletedAt: null,
    team: { name: 'Equipe Azul' },
    category: sportsAdminRegistrationCategory(),
    ...overrides,
  };
}

export function sportsAdminVenueRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'venue-1',
    tournamentId: 'tournament-1',
    placePresetId: 'place-1',
    name: 'Ginásio Universitário',
    courtLabel: 'Quadra principal',
    capacity: 420,
    notes: 'Entrada lateral',
    parentVenueId: null,
    revision: 3,
    deletedAt: null,
    createdAt: sportsTestDate(-24 * 60 * 60_000),
    updatedAt: sportsTestDate(-60 * 60_000),
    createdById: 'admin-1',
    updatedById: 'admin-1',
    tournament: { majorEventId: 'major-event-1' },
    placePreset: {
      id: 'place-1',
      latitude: -22.12,
      longitude: -51.4,
      locationDescription: 'Campus universitário',
    },
    ...overrides,
  };
}

export function sportsAdminReadRecords() {
  const team = {
    id: 'team-1',
    tournamentId: 'tournament-1',
    name: 'Equipe Azul',
    institution: 'FCT',
    status: 'ACTIVE',
    logoSha256: 'logo-sha',
    fieldRevisions: { name: 2 },
  };
  const category = {
    id: 'category-1',
    name: 'Futsal',
    eventGroup: { emoji: '' },
    scoreRules: { win: 3 },
    overallScoringRules: {},
    timerRules: {},
    rosterRules: {},
    bracketRules: {},
    standingsRules: {},
  };
  const registration = {
    id: 'registration-1',
    teamId: team.id,
    categoryId: category.id,
    formAnswers: { captain: true },
    formSchemaSnapshot: null,
  };
  const match = {
    id: 'match-1',
    eventId: 'event-1',
    categoryId: category.id,
    scoreboard: { home: 2, away: 1, activePeriodNumber: null, periods: [] },
    canonicalScoreboard: { home: 1, away: 1, activePeriodNumber: null, periods: [] },
    occurrences: [{ type: 'GOAL' }],
    timerStartedAt: sportsTestDate(-5 * 60_000),
    timerPausedAt: null,
    event: { id: 'event-1' },
  };
  return { team, category, registration, match };
}

export function sportsCurrentUserTournamentFixture() {
  const match = (id: string, offset: number, homeTeamId: string) => ({
    id,
    categoryId: 'category-1',
    homeTeam: { id: homeTeamId, name: `Equipe ${homeTeamId}` },
    awayTeam: { id: `away-${id}`, name: `Visitante ${id}` },
    schedule: { startDate: sportsTestDate(offset), endDate: sportsTestDate(offset + 60 * 60_000) },
  });
  return {
    id: 'tournament-1',
    majorEventId: 'major-event-1',
    matches: [
      match('unrelated-earlier', 60 * 60_000, 'team-other'),
      match('team-match', 3 * 60 * 60_000, 'team-member'),
      match('player-match', 4 * 60 * 60_000, 'team-other'),
    ],
  };
}

export function sportsAdminCategoryRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...sportsAdminAuditRecords().category,
    customSportName: null,
    registrationStartDate: sportsTestDate(-7 * 24 * 60 * 60_000),
    registrationEndDate: sportsTestDate(7 * 24 * 60 * 60_000),
    minimumRosterSize: 5,
    maximumRosterSize: 12,
    maximumCaptains: 1,
    maximumCoaches: 2,
    allowPlayerMultipleTeams: false,
    periodsEnabled: true,
    maximumPeriods: 4,
    periodLabel: 'Tempo',
    timerRules: {},
    scoreRules: {},
    overallScoringRules: {},
    rosterRules: {},
    bracketRules: {},
    standingsRules: {},
    rulesText: 'Regras oficiais',
    registrationFormId: null,
    finishedAt: null,
    deletedAt: null,
    eventGroup: { id: 'event-group-1', name: 'Futsal', emoji: '⚽' },
    tournament: { majorEventId: 'major-event-1' },
    ...overrides,
  };
}

export function sportsAdminTournamentRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...sportsAdminAuditRecords().tournament,
    scoringMode: 'BOTH',
    finishedAt: null,
    deletedAt: null,
    majorEvent: {
      id: 'major-event-1',
      name: 'Jogos Universitários',
      emoji: '🏆',
      startDate: sportsTestDate(24 * 60 * 60_000),
      endDate: sportsTestDate(4 * 24 * 60 * 60_000),
      subscriptionStartDate: sportsTestDate(-7 * 24 * 60 * 60_000),
      subscriptionEndDate: sportsTestDate(12 * 60 * 60_000),
      deletedAt: null,
    },
    ...overrides,
  };
}

export function sportsAdminOfficialAssignmentRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...sportsAdminAuditRecords().official,
    assignedAt: sportsTestDate(-2 * 60 * 60_000),
    assignedById: 'admin-1',
    revokedAt: null,
    revokedById: null,
    tournament: { majorEventId: 'major-event-1' },
    category: { eventGroupId: 'event-group-1' },
    match: null,
    ...overrides,
  };
}

export function sportsTournamentParticipantMembershipRecord(teamIds: readonly string[]): Record<string, unknown> {
  return {
    id: 'participant-1',
    teamMemberships: teamIds.map((teamId, index) => ({ id: `membership-${index + 1}`, teamId })),
  };
}

export function sportsAdminBackingEventRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'event-1',
    majorEventId: 'major-event-1',
    eventGroupId: 'event-group-1',
    name: 'Partida classificatória',
    startDate: sportsTestDate(60 * 60_000),
    endDate: sportsTestDate(2 * 60 * 60_000),
    allowSubscription: false,
    shouldCollectAttendance: false,
    sportsMatch: null,
    deletedAt: null,
    ...overrides,
  };
}

export function sportsBracketMatchRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'match-1',
    categoryId: 'category-1',
    category: { tournamentId: 'tournament-1' },
    stageId: 'stage-1',
    stage: { settings: {} },
    event: {
      deletedAt: null,
      isPubliclyListed: false,
      publicationState: 'DRAFT',
    },
    state: 'SCHEDULED',
    canonicalState: 'SCHEDULED',
    reviewStatus: 'NOT_REQUIRED',
    homeRegistrationId: null,
    awayRegistrationId: null,
    winnerRegistrationId: null,
    loserRegistrationId: null,
    revision: 1,
    operationSequence: 0,
    ...overrides,
  };
}
