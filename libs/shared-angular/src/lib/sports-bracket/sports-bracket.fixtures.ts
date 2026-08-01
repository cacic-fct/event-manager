import { faker } from '@faker-js/faker';
import type {
  SportsBracketFormat,
  SportsBracketMatchView,
  SportsBracketStageView,
  SportsBracketStandingView,
  SportsBracketTeamView,
} from './sports-bracket.models';

faker.seed(20260801);

const teamNames = [
  'Atlética FCT',
  'Engenharia sem Fronteiras',
  'República Vento Norte',
  'Centro Acadêmico Ada Lovelace',
  'Bateria Universitária',
  'Equipe Horizonte',
  'Liga do Campus',
  'Associação Esportiva Pioneira',
  'Diretório Acadêmico de Ciências Exatas e Tecnologia',
  'Instituto de Pesquisas Aplicadas',
  'Coletivo Universitário Aurora',
  'Equipe Politécnica do Oeste',
  'Associação Atlética Acadêmica Vinte e Oito de Agosto',
  'Núcleo de Estudos Esportivos',
  'República Estação Central',
  'Clube Universitário Ipê Amarelo',
];

const colors = ['#315da8', '#9b3f52', '#26735c', '#7653a6', '#a45c22', '#286b82', '#4d6632', '#7a4f35'];

export const SPORTS_BRACKET_TEAMS: readonly SportsBracketTeamView[] = teamNames.map(
  (name, index) => ({
    id: `team-${index + 1}`,
    name,
    logoUrl: `/api/storybook/sports/team-logo/team-${index + 1}?color=${encodeURIComponent(
      colors[index % colors.length],
    )}`,
  }),
);

const match = (
  id: string,
  roundNumber: number,
  bracketPosition: number,
  homeIndex: number | null,
  awayIndex: number | null,
  state: SportsBracketMatchView['state'] = 'SCHEDULED',
  homeScore = 0,
  awayScore = 0,
  groupKey?: string,
): SportsBracketMatchView => ({
  id,
  roundNumber,
  bracketPosition,
  groupKey,
  state,
  homeTeam: homeIndex === null ? null : SPORTS_BRACKET_TEAMS[homeIndex],
  awayTeam: awayIndex === null ? null : SPORTS_BRACKET_TEAMS[awayIndex],
  scoreboard: { homeScore, awayScore },
});

const eliminationMatches = (prefix: string): SportsBracketMatchView[] => [
  match(`${prefix}-r1-1`, 1, 1, 0, 1, 'FINISHED', 3, 1),
  match(`${prefix}-r1-2`, 1, 2, 2, 3, 'FINISHED', 2, 0),
  match(`${prefix}-r1-3`, 1, 3, 4, null, 'FINISHED', 1, 0),
  match(`${prefix}-r1-4`, 1, 4, 6, 7, 'FINISHED', 1, 2),
  match(`${prefix}-r1-5`, 1, 5, 8, 9, 'FINISHED', 4, 3),
  match(`${prefix}-r1-6`, 1, 6, 10, 11, 'AWAITING_REVIEW', 2, 1),
  match(`${prefix}-r1-7`, 1, 7, 12, 13, 'DRAW', 1, 1),
  match(`${prefix}-r1-8`, 1, 8, 14, 15, 'FINISHED', 0, 2),
  match(`${prefix}-r2-1`, 2, 1, 0, 2, 'LIVE', 1, 1),
  match(`${prefix}-r2-2`, 2, 2, 4, 7, 'CHECK_IN'),
  match(`${prefix}-r2-3`, 2, 3, 8, 10),
  match(`${prefix}-r2-4`, 2, 4, 12, 15),
  match(`${prefix}-r3-1`, 3, 1, null, null),
  match(`${prefix}-r3-2`, 3, 2, null, null),
  match(`${prefix}-r4-1`, 4, 1, null, null),
];

export const SPORTS_BRACKET_STANDINGS: readonly SportsBracketStandingView[] =
  SPORTS_BRACKET_TEAMS.slice(0, 8).map((team, index) => ({
    team,
    played: 7,
    wins: Math.max(1, 7 - index),
    draws: faker.number.int({ min: 0, max: 2 }),
    losses: Math.min(index, 5),
    points: Math.max(3, 21 - index * 2),
    rank: index + 1,
  }));

export interface SportsBracketFixture {
  format: SportsBracketFormat;
  emoji: string;
  stages: readonly SportsBracketStageView[];
  standings: readonly SportsBracketStandingView[];
  currentMatchId?: string | null;
  editingMatchId?: string | null;
}

export const SPORTS_BRACKET_FIXTURES: Readonly<Record<SportsBracketFormat, SportsBracketFixture>> = {
  SINGLE_ELIMINATION: {
    format: 'SINGLE_ELIMINATION',
    emoji: '⚽',
    stages: [
      {
        id: 'single-main',
        name: 'Chave principal',
        type: 'ELIMINATION',
        displayOrder: 0,
        matches: eliminationMatches('single'),
      },
    ],
    standings: [],
    currentMatchId: 'single-r2-1',
    editingMatchId: 'single-r2-2',
  },
  ROUND_ROBIN: {
    format: 'ROUND_ROBIN',
    emoji: '🏀',
    stages: [
      {
        id: 'league',
        name: 'Turno classificatório',
        type: 'GROUP',
        displayOrder: 0,
        matches: Array.from({ length: 16 }, (_, index) => {
          const round = Math.floor(index / 4) + 1;
          const homeIndex = (index * 2) % 8;
          const awayIndex = (index * 2 + round) % 8;
          const state: SportsBracketMatchView['state'] = index < 8
            ? 'FINISHED'
            : index === 8
              ? 'LIVE'
              : index === 9
                ? 'AWAITING_REVIEW'
                : 'SCHEDULED';
          return match(
            `league-${index + 1}`,
            round,
            (index % 4) + 1,
            homeIndex,
            awayIndex,
            state,
            state === 'SCHEDULED' ? 0 : faker.number.int({ min: 0, max: 5 }),
            state === 'SCHEDULED' ? 0 : faker.number.int({ min: 0, max: 5 }),
          );
        }),
      },
    ],
    standings: SPORTS_BRACKET_STANDINGS,
    currentMatchId: 'league-9',
    editingMatchId: 'league-10',
  },
  GROUP_STAGE_ELIMINATION: {
    format: 'GROUP_STAGE_ELIMINATION',
    emoji: '🏐',
    stages: [
      {
        id: 'groups',
        name: 'Grupos A e B',
        type: 'GROUP',
        displayOrder: 0,
        matches: [
          match('group-1', 1, 1, 0, 1, 'FINISHED', 2, 0, 'A'),
          match('group-2', 1, 2, 2, 3, 'FINISHED', 1, 1, 'A'),
          match('group-3', 1, 3, 4, 5, 'LIVE', 0, 0, 'B'),
          match('group-4', 1, 4, 6, 7, 'SCHEDULED', 0, 0, 'B'),
          match('group-5', 2, 1, 0, 2, 'SCHEDULED', 0, 0, 'A'),
          match('group-6', 2, 2, 1, 3, 'SCHEDULED', 0, 0, 'A'),
          match('group-7', 2, 3, 4, 6, 'AWAITING_REVIEW', 2, 1, 'B'),
          match('group-8', 2, 4, 5, 7, 'CHECK_IN', 0, 0, 'B'),
        ],
      },
      {
        id: 'group-finals',
        name: 'Fase final',
        type: 'ELIMINATION',
        displayOrder: 1,
        matches: [
          match('group-semi-1', 1, 1, 0, 4),
          match('group-semi-2', 1, 2, 2, 6),
          match('group-final', 2, 1, null, null),
        ],
      },
    ],
    standings: SPORTS_BRACKET_STANDINGS,
    currentMatchId: 'group-3',
  },
  DOUBLE_ELIMINATION: {
    format: 'DOUBLE_ELIMINATION',
    emoji: '🎮',
    stages: [
      {
        id: 'winners',
        name: 'Chave dos vencedores',
        type: 'WINNERS_BRACKET',
        displayOrder: 0,
        matches: eliminationMatches('winner'),
      },
      {
        id: 'losers',
        name: 'Chave de repescagem',
        type: 'LOSERS_BRACKET',
        displayOrder: 1,
        matches: [
          match('loser-1', 1, 1, 1, 3, 'FINISHED', 2, 1),
          match('loser-2', 1, 2, 5, 6, 'FINISHED', 0, 1),
          match('loser-3', 2, 1, 1, 6),
        ],
      },
      {
        id: 'grand-final',
        name: 'Grande final',
        type: 'FINAL',
        displayOrder: 2,
        matches: [match('double-final', 1, 1, null, null)],
      },
    ],
    standings: [],
    currentMatchId: 'winner-r2-1',
    editingMatchId: 'loser-3',
  },
  SWISS: {
    format: 'SWISS',
    emoji: '♟️',
    stages: [
      {
        id: 'swiss',
        name: 'Emparceiramentos',
        type: 'SWISS',
        displayOrder: 0,
        matches: Array.from({ length: 16 }, (_, index) =>
          match(
            `swiss-${index + 1}`,
            Math.floor(index / 4) + 1,
            (index % 4) + 1,
            (index * 2) % 8,
            (index * 2 + 1) % 8,
            index < 10
              ? 'FINISHED'
              : index === 10
                ? 'LIVE'
                : index === 11
                  ? 'AWAITING_REVIEW'
                  : 'SCHEDULED',
            index < 12 ? faker.number.int({ min: 0, max: 2 }) : 0,
            index < 12 ? faker.number.int({ min: 0, max: 2 }) : 0,
          ),
        ),
      },
    ],
    standings: SPORTS_BRACKET_STANDINGS,
    currentMatchId: 'swiss-11',
    editingMatchId: 'swiss-12',
  },
  CUSTOM: {
    format: 'CUSTOM',
    emoji: '🏊',
    stages: [
      {
        id: 'custom-pools',
        name: 'Série universitária',
        type: 'GROUP',
        displayOrder: 0,
        matches: [
          match('custom-1', 1, 1, 0, 4, 'FINISHED', 10, 8),
          match('custom-2', 1, 2, 2, 6, 'CANCELED'),
          match('custom-3', 2, 1, 4, 6, 'AWAITING_REVIEW', 9, 7),
        ],
      },
    ],
    standings: SPORTS_BRACKET_STANDINGS.slice(0, 4),
    editingMatchId: 'custom-3',
  },
};
