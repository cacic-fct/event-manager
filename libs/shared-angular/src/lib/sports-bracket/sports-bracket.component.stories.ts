import { fakerPT_BR as faker } from '@faker-js/faker';
import { HttpResponse, http } from 'msw';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SportsBracketComponent } from './sports-bracket.component';
import type {
  SportsBracketFormat,
  SportsBracketMatchView,
  SportsBracketStageView,
  SportsBracketStandingView,
  SportsBracketTeamView,
} from './sports-bracket.models';

type LogoMode = 'all' | 'mixed' | 'none';

interface SportsBracketStoryArgs {
  format: SportsBracketFormat;
  teamCount: number;
  includeStandings: boolean;
  logoMode: LogoMode;
  editingMatchId: string | null;
  empty: boolean;
  matchSelected: (matchId: string) => void;
}

const teamColors = ['#315da8', '#9b3f52', '#26735c', '#7653a6', '#a45c22', '#286b82', '#4d6632', '#7a4f35'];
const familiarTeamNames = [
  'Atlética FCT',
  'Engenharia sem Fronteiras',
  'República Vento Norte',
  'Centro Acadêmico Ada Lovelace',
];

const meta: Meta<SportsBracketStoryArgs> = {
  component: SportsBracketComponent,
  title: 'CACiC Eventos/Shared/Sports/Tournament bracket',
  tags: ['autodocs'],
  args: {
    format: 'SINGLE_ELIMINATION',
    teamCount: 16,
    includeStandings: false,
    logoMode: 'mixed',
    editingMatchId: 'single-r2-2',
    empty: false,
    matchSelected: fn(),
  },
  argTypes: {
    format: {
      control: 'select',
      options: [
        'SINGLE_ELIMINATION',
        'ROUND_ROBIN',
        'GROUP_STAGE_ELIMINATION',
        'DOUBLE_ELIMINATION',
        'SWISS',
        'CUSTOM',
      ],
    },
    teamCount: { control: { type: 'range', min: 4, max: 32, step: 1 } },
    includeStandings: { control: 'boolean' },
    logoMode: { control: 'inline-radio', options: ['all', 'mixed', 'none'] },
    editingMatchId: { control: 'text' },
    empty: { control: 'boolean' },
    matchSelected: { table: { disable: true } },
  },
  render: (args) => ({
    props: {
      ...createBracket(args),
      matchSelected: args.matchSelected,
    },
  }),
  parameters: {
    layout: 'padded',
    viewport: { defaultViewport: 'responsive' },
    msw: {
      handlers: [
        http.get('/api/storybook/sports/team-logo/:teamId', ({ request }) => {
          const requestedColor = new URL(request.url).searchParams.get('color') ?? '';
          const color = /^#[0-9a-f]{6}$/i.test(requestedColor) ? requestedColor : '#315da8';
          return HttpResponse.text(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="${color}" d="M32 5 52 12v18c0 13-8 24-20 29C20 54 12 43 12 30V12z"/><path fill="white" d="m24 31 5 5 11-12 4 4-15 16-9-9z"/></svg>`,
            { headers: { 'Content-Type': 'image/svg+xml' } },
          );
        }),
      ],
    },
  },
};

export default meta;
type Story = StoryObj<SportsBracketStoryArgs>;

export const Playground: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const liveMatch = canvas.getByRole('button', {
      name: /Atlética FCT contra República Vento Norte. Ao vivo/i,
    });
    await userEvent.click(liveMatch);
    await expect(args.matchSelected).toHaveBeenCalledWith('single-r2-1');
  },
};

export const ManyTeamsWithControls: Story = {
  name: 'Muitas equipes e controles',
  args: {
    teamCount: 24,
    includeStandings: true,
    logoMode: 'mixed',
  },
};

export const EliminacaoSimplesComFolgaENomesLongos: Story = {
  args: { format: 'SINGLE_ELIMINATION', teamCount: 24, includeStandings: true },
};

export const TodosContraTodos: Story = {
  args: { format: 'ROUND_ROBIN', teamCount: 12, includeStandings: true },
};

export const GruposEEliminatorias: Story = {
  args: { format: 'GROUP_STAGE_ELIMINATION', teamCount: 16, includeStandings: true },
};

export const DuplaEliminacao: Story = {
  args: { format: 'DOUBLE_ELIMINATION', teamCount: 16 },
};

export const SistemaSuico: Story = {
  args: { format: 'SWISS', teamCount: 20, includeStandings: true },
};

export const FormatoPersonalizado: Story = {
  args: { format: 'CUSTOM', teamCount: 8, includeStandings: true },
};

export const SemLogosPublicados: Story = {
  name: 'Sem logos publicados',
  args: { logoMode: 'none' },
};

export const Vazio: Story = {
  args: {
    empty: true,
    editingMatchId: null,
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Estrutura ainda não publicada')).toBeVisible();
  },
};

export const DarkReducedMotion: Story = {
  args: {
    format: 'GROUP_STAGE_ELIMINATION',
    teamCount: 16,
    includeStandings: true,
    logoMode: 'mixed',
    editingMatchId: null,
  },
  globals: { theme: 'dark', motion: 'reduced' },
};

function createBracket(args: SportsBracketStoryArgs) {
  const teamCount = Math.min(32, Math.max(4, Math.round(args.teamCount)));
  if (args.empty) {
    return {
      format: args.format,
      emoji: '⚽',
      stages: [] as readonly SportsBracketStageView[],
      standings: [] as readonly SportsBracketStandingView[],
      editingMatchId: null,
    };
  }

  faker.seed(20260809 + teamCount);
  const teams = createTeams(teamCount, args.logoMode);
  return {
    format: args.format,
    emoji: '⚽',
    stages: createStages(args.format, teams),
    standings: args.includeStandings ? createStandings(teams) : [],
    editingMatchId: args.editingMatchId,
  };
}

function createTeams(teamCount: number, logoMode: LogoMode): SportsBracketTeamView[] {
  return Array.from({ length: teamCount }, (_, index) => {
    const id = `team-${index + 1}`;
    const name = familiarTeamNames[index] ?? `${faker.company.name()} ${index + 1}`;
    const hasLogo = logoMode === 'all' || (logoMode === 'mixed' && index % 4 !== 3);
    return {
      id,
      name,
      logoUrl: hasLogo
        ? `/api/storybook/sports/team-logo/${id}?color=${encodeURIComponent(teamColors[index % teamColors.length])}`
        : null,
    };
  });
}

function createStandings(teams: readonly SportsBracketTeamView[]): SportsBracketStandingView[] {
  return teams.map((team, index) => ({
    team,
    played: 7,
    wins: Math.max(1, 7 - (index % 6)),
    draws: faker.number.int({ min: 0, max: 2 }),
    losses: index % 6,
    points: Math.max(3, 21 - index * 2),
    rank: index + 1,
  }));
}

function createStages(format: SportsBracketFormat, teams: readonly SportsBracketTeamView[]): SportsBracketStageView[] {
  switch (format) {
    case 'SINGLE_ELIMINATION':
      return [createEliminationStage('single', 'Chave principal', 'ELIMINATION', teams)];
    case 'ROUND_ROBIN':
      return [createRoundRobinStage('round-robin', 'Turno classificatório', 'GROUP', teams, 4)];
    case 'GROUP_STAGE_ELIMINATION':
      return [
        createRoundRobinStage('groups', 'Grupos A e B', 'GROUP', teams, 2),
        createEliminationStage(
          'group-finals',
          'Fase final',
          'ELIMINATION',
          teams.slice(0, Math.max(4, Math.ceil(teams.length / 2))),
        ),
      ];
    case 'DOUBLE_ELIMINATION':
      return [
        createEliminationStage('winners', 'Chave dos vencedores', 'WINNERS_BRACKET', teams),
        createRoundRobinStage(
          'losers',
          'Chave de repescagem',
          'LOSERS_BRACKET',
          teams.slice(0, Math.max(4, Math.ceil(teams.length / 2))),
          2,
        ),
        createEliminationStage('double-final', 'Grande final', 'FINAL', teams.slice(0, 4)),
      ];
    case 'SWISS':
      return [createRoundRobinStage('swiss', 'Emparceiramentos', 'SWISS', teams, 4)];
    case 'CUSTOM':
      return [createRoundRobinStage('custom', 'Série universitária', 'GROUP', teams, 2)];
  }
}

function createEliminationStage(
  prefix: string,
  name: string,
  type: SportsBracketStageView['type'],
  teams: readonly SportsBracketTeamView[],
): SportsBracketStageView {
  const bracketSize = 2 ** Math.ceil(Math.log2(teams.length));
  const roundCount = Math.max(1, Math.log2(bracketSize));
  const matches: SportsBracketMatchView[] = [];

  for (let round = 1; round <= roundCount; round += 1) {
    const matchCount = Math.max(1, bracketSize / 2 ** round);
    for (let position = 0; position < matchCount; position += 1) {
      const isFinal = round === roundCount;
      const homeIndex = isFinal ? null : (position * 2 ** round) % teams.length;
      const awayIndex = isFinal ? null : (position * 2 ** round + 2 ** (round - 1)) % teams.length;
      const state: SportsBracketMatchView['state'] =
        round === 1
          ? 'FINISHED'
          : round === 2 && position === 0
            ? 'LIVE'
            : round === 2 && position === 1
              ? 'CHECK_IN'
              : 'SCHEDULED';
      matches.push({
        id: `${prefix}-r${round}-${position + 1}`,
        roundNumber: round,
        bracketPosition: position + 1,
        state,
        homeTeam: homeIndex === null ? null : teams[homeIndex],
        awayTeam: awayIndex === null ? null : teams[awayIndex],
        scoreboard: {
          homeScore: state === 'SCHEDULED' || state === 'CHECK_IN' ? 0 : faker.number.int({ min: 0, max: 5 }),
          awayScore: state === 'SCHEDULED' || state === 'CHECK_IN' ? 0 : faker.number.int({ min: 0, max: 5 }),
        },
      });
    }
  }

  return { id: prefix, name, type, displayOrder: 0, matches };
}

function createRoundRobinStage(
  prefix: string,
  name: string,
  type: SportsBracketStageView['type'],
  teams: readonly SportsBracketTeamView[],
  roundCount: number,
): SportsBracketStageView {
  const matches: SportsBracketMatchView[] = [];
  const matchesPerRound = Math.max(1, Math.ceil(teams.length / 2));
  for (let round = 1; round <= roundCount; round += 1) {
    for (let position = 0; position < matchesPerRound; position += 1) {
      const homeIndex = (position * 2 + round - 1) % teams.length;
      const awayIndex = (homeIndex + 1) % teams.length;
      const isLive = round === 1 && position === 0;
      const state: SportsBracketMatchView['state'] = isLive
        ? 'LIVE'
        : round === 1 && position === 1
          ? 'AWAITING_REVIEW'
          : round === 1
            ? 'FINISHED'
            : 'SCHEDULED';
      matches.push({
        id: `${prefix}-r${round}-${position + 1}`,
        roundNumber: round,
        bracketPosition: position + 1,
        groupKey: type === 'GROUP' ? String.fromCharCode(65 + (position % 2)) : undefined,
        state,
        homeTeam: teams[homeIndex],
        awayTeam: teams[awayIndex],
        scoreboard: {
          homeScore: state === 'SCHEDULED' ? 0 : faker.number.int({ min: 0, max: 5 }),
          awayScore: state === 'SCHEDULED' ? 0 : faker.number.int({ min: 0, max: 5 }),
        },
      });
    }
  }
  return { id: prefix, name, type, displayOrder: 0, matches };
}
