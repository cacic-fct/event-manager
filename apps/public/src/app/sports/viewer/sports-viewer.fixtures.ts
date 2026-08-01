import { faker } from '@faker-js/faker';
import type {
  PublicSportsMatch,
  PublicSportsRoster,
  PublicSportsTeam,
  PublicSportsTournamentDetail,
} from './sports-viewer.types';
import type { SportsMatchState } from '@cacic-fct/shared-data-types';

faker.seed(20260801);

const startDate = new Date();
startDate.setDate(startDate.getDate() + 2);
startDate.setHours(18, 30, 0, 0);
const endDate = new Date(startDate.getTime() + 90 * 60_000);

export function createSportsViewerMatch(
  overrides: Partial<PublicSportsMatch> = {},
): PublicSportsMatch {
  return {
    id: faker.string.uuid(),
    eventId: faker.string.uuid(),
    categoryId: 'futsal-aberto',
    stageId: 'eliminatorias',
    homeTeam: {
      id: 'equipe-atletica',
      name: 'Atlética FCT',
      institution: 'FCT-Unesp',
      logoUrl: null,
    },
    awayTeam: {
      id: 'equipe-ciencia',
      name: 'Ciência da Computação',
      institution: 'FCT-Unesp',
      logoUrl: null,
    },
    state: 'LIVE',
    scoreboard: {
      homeScore: 2,
      awayScore: 1,
      activePeriod: 2,
      periods: [
        { number: 1, label: '1º tempo', homeScore: 1, awayScore: 1, completed: true },
        { number: 2, label: '2º tempo', homeScore: 1, awayScore: 0, completed: false },
      ],
    },
    winner: null,
    loser: null,
    lossReason: null,
    lossReasonDetail: null,
    drawWillReschedule: null,
    timerStartedAt: new Date(startDate.getTime() + 5 * 60_000).toISOString(),
    timerPausedAt: null,
    elapsedBeforePauseMs: 0,
    roundNumber: 1,
    bracketPosition: 1,
    groupKey: null,
    schedule: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      venueName: 'Ginásio da FCT',
      courtLabel: 'Quadra principal',
      locationDescription: 'Campus de Presidente Prudente',
      latitude: -22.1207,
      longitude: -51.4074,
    },
    rosters: [],
    officials: [
      { name: 'Mariana Clara dos Santos', role: 'REFEREE' },
      { name: 'Rafael Oliveira Costa', role: 'SCOREKEEPER' },
    ],
    livestreamProvider: 'YOUTUBE',
    livestreamUrl: 'https://www.youtube.com/watch?v=storybook-sports',
    ...overrides,
  };
}

export function createSportsViewerRoster(): PublicSportsRoster[] {
  return [
    {
      team: {
        id: 'equipe-atletica',
        name: 'Atlética FCT',
        institution: 'FCT-Unesp',
        logoUrl: null,
      },
      entries: [
        { name: 'Ana Beatriz de Souza', role: 'CAPTAIN' },
        { name: 'Carlos Eduardo Lima', role: 'PLAYER' },
        { name: 'Joana Vitória de Almeida', role: 'PLAYER' },
      ],
    },
    {
      team: {
        id: 'equipe-ciencia',
        name: 'Ciência da Computação',
        institution: 'FCT-Unesp',
        logoUrl: null,
      },
      entries: [
        { name: 'Bruno Henrique Oliveira', role: 'CAPTAIN' },
        { name: 'Marina Luiza dos Santos', role: 'PLAYER' },
      ],
    },
  ];
}

export function createSportsViewerMatchForState(
  state: SportsMatchState,
): PublicSportsMatch {
  const final = state === 'FINISHED' || state === 'DRAW';
  return createSportsViewerMatch({
    state,
    scoreboard: {
      homeScore: final || ['LIVE', 'PAUSED', 'AWAITING_REVIEW'].includes(state) ? 3 : 0,
      awayScore: final || ['LIVE', 'PAUSED', 'AWAITING_REVIEW'].includes(state) ? 1 : 0,
      activePeriod: state === 'LIVE' || state === 'PAUSED' ? 2 : null,
      periods: final || ['LIVE', 'PAUSED', 'AWAITING_REVIEW'].includes(state)
        ? [
          { number: 1, label: '1º tempo', homeScore: 2, awayScore: 1, completed: true },
          {
            number: 2,
            label: '2º tempo',
            homeScore: 1,
            awayScore: 0,
            completed: final || state === 'AWAITING_REVIEW',
          },
        ]
        : [],
    },
    winner: state === 'FINISHED'
      ? { id: 'equipe-atletica', name: 'Atlética FCT' }
      : null,
    loser: state === 'FINISHED'
      ? { id: 'equipe-ciencia', name: 'Ciência da Computação' }
      : null,
    lossReason: state === 'FINISHED' ? 'SCORE' : null,
    drawWillReschedule: state === 'DRAW' ? true : null,
    timerStartedAt: state === 'LIVE'
      ? new Date(Date.now() - 32 * 60_000).toISOString()
      : null,
    timerPausedAt: state === 'PAUSED' ? new Date().toISOString() : null,
    elapsedBeforePauseMs: state === 'PAUSED' ? 32 * 60_000 : 0,
    rosters: final ? createSportsViewerRoster() : [],
  });
}

export function createSportsViewerTournament(
  overrides: Partial<PublicSportsTournamentDetail> = {},
): PublicSportsTournamentDetail {
  const liveMatch = createSportsViewerMatch({ id: 'partida-ao-vivo' });
  const scheduledMatch = createSportsViewerMatch({
    id: 'proxima-partida',
    state: 'SCHEDULED',
    scoreboard: { homeScore: 0, awayScore: 0, activePeriod: null, periods: [] },
    schedule: {
      ...liveMatch.schedule,
      startDate: new Date(startDate.getTime() + 2 * 60 * 60_000).toISOString(),
      endDate: new Date(endDate.getTime() + 2 * 60 * 60_000).toISOString(),
    },
  });
  const teams: [PublicSportsTeam, PublicSportsTeam] = [
    liveMatch.homeTeam as PublicSportsTeam,
    liveMatch.awayTeam as PublicSportsTeam,
  ];

  return {
    id: 'interfct-2026',
    majorEventId: 'semana-universitaria-2026',
    name: 'InterFCT 2026',
    emoji: '🏆',
    description:
      'Jogos universitários com modalidades coletivas e individuais. Acompanhe placares, classificação e chaves em tempo real.',
    startDate: startDate.toISOString(),
    endDate: new Date(startDate.getTime() + 5 * 24 * 60 * 60_000).toISOString(),
    selfSubscriptionEnabled: true,
    isPaymentRequired: true,
    paymentTiers: [
      { id: 'tier-student', name: 'Estudante', value: 2500 },
    ],
    teams,
    matches: [liveMatch, scheduledMatch],
    overallScores: [
      { team: teams[0], points: 18 },
      { team: teams[1], points: 14 },
    ],
    categories: [
      {
        id: 'futsal-aberto',
        name: 'Futsal aberto',
        emoji: '⚽',
        sport: 'FUTSAL',
        customSportName: null,
        division: 'Aberto',
        format: 'SINGLE_ELIMINATION',
        rulesText: 'Partidas com dois tempos. Em caso de empate na fase eliminatória, haverá disputa de pênaltis.',
        standings: [
          {
            team: teams[0],
            played: 3,
            wins: 3,
            draws: 0,
            losses: 0,
            scoreFor: 8,
            scoreAgainst: 3,
            points: 9,
            rank: 1,
          },
          {
            team: teams[1],
            played: 3,
            wins: 2,
            draws: 0,
            losses: 1,
            scoreFor: 6,
            scoreAgainst: 4,
            points: 6,
            rank: 2,
          },
        ],
        placements: [],
        brackets: [
          {
            id: 'chave-principal',
            name: 'Chave principal',
            type: 'ELIMINATION',
            displayOrder: 0,
            matches: [liveMatch, scheduledMatch],
          },
        ],
        matches: [liveMatch, scheduledMatch],
      },
    ],
    ...overrides,
  };
}

export function createMultiSportViewerTournament(): PublicSportsTournamentDetail {
  const tournament = createSportsViewerTournament();
  const presets = [
    ['Futebol feminino', 'SOCCER', 'GROUP_STAGE_ELIMINATION', 'Feminino', '⚽'],
    ['Tênis individual', 'TENNIS', 'SINGLE_ELIMINATION', 'Livre', '🎾'],
    ['Basquete masculino', 'BASKETBALL', 'ROUND_ROBIN', 'Masculino', '🏀'],
    ['League of Legends', 'ESPORTS', 'DOUBLE_ELIMINATION', 'Aberto', '🎮'],
    ['Xadrez rápido', 'CHESS', 'SWISS', 'Aberto', '♟️'],
    ['Vôlei misto', 'VOLLEYBALL', 'ROUND_ROBIN', 'Misto', '🏐'],
    ['Natação 50 m livre', 'SWIMMING', 'CUSTOM', 'Feminino', '🏊'],
  ] as const;
  return {
    ...tournament,
    categories: presets.map(([name, sport, format, division, emoji], index) => ({
      id: `category-preset-${index + 1}`,
      name,
      emoji,
      sport,
      customSportName: null,
      division,
      format,
      rulesText: index === 0
        ? 'Fase de grupos seguida por semifinal e final.'
        : 'Regulamento publicado pela organização.',
      standings: tournament.categories[0]?.standings ?? [],
      placements: [],
      brackets: index === 0 ? tournament.categories[0]?.brackets ?? [] : [],
      matches: index === 0 ? tournament.matches : [],
    })),
  };
}
