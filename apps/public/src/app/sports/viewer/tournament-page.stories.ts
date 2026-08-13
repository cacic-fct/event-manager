import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { delay, HttpResponse, http } from 'msw';
import { NEVER, Observable, of, throwError, timer } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { SportsTournamentPage } from './tournament-page';
import { SportsViewerRealtimeService } from './sports-viewer-realtime.service';
import { createMultiSportViewerTournament, createSportsViewerTournament } from './sports-viewer.fixtures';

type LoadMode = 'ready' | 'loading' | 'error';

interface TournamentStoryArgs {
  name: string;
  liveScoreHome: number;
  liveScoreAway: number;
  showOverallScore: boolean;
  showRules: boolean;
  showTeams: boolean;
  multiSport: boolean;
  loadMode: LoadMode;
  liveConnectionLost: boolean;
}

const defaultArgs: TournamentStoryArgs = {
  name: 'InterFCT 2026',
  liveScoreHome: 2,
  liveScoreAway: 1,
  showOverallScore: true,
  showRules: true,
  showTeams: true,
  multiSport: true,
  loadMode: 'ready',
  liveConnectionLost: false,
};

let activeArgs = defaultArgs;

const route = {
  paramMap: of(convertToParamMap({ tournamentId: 'interfct-2026' })),
  snapshot: { paramMap: convertToParamMap({ tournamentId: 'interfct-2026' }) },
};

function controlledTournament() {
  const tournament = activeArgs.multiSport ? createMultiSportViewerTournament() : createSportsViewerTournament();
  const [liveMatch] = tournament.matches;
  if (liveMatch) {
    liveMatch.scoreboard.homeScore = activeArgs.liveScoreHome;
    liveMatch.scoreboard.awayScore = activeArgs.liveScoreAway;
  }
  return {
    ...tournament,
    name: activeArgs.name,
    teams: activeArgs.showTeams ? tournament.teams : [],
    overallScores: activeArgs.showOverallScore ? tournament.overallScores : [],
    categories: tournament.categories.map((category) => ({
      ...category,
      rulesText: activeArgs.showRules ? category.rulesText : null,
    })),
  };
}

const meta: Meta<TournamentStoryArgs> = {
  component: SportsTournamentPage,
  title: 'CACiC Eventos/Sports/Viewer/Tournament',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    name: { control: 'text' },
    liveScoreHome: { control: { type: 'number', min: 0, max: 999 } },
    liveScoreAway: { control: { type: 'number', min: 0, max: 999 } },
    showOverallScore: { control: 'boolean' },
    showRules: { control: 'boolean' },
    showTeams: { control: 'boolean' },
    multiSport: { control: 'boolean' },
    loadMode: { control: 'inline-radio', options: ['ready', 'loading', 'error'] },
    liveConnectionLost: { control: 'boolean' },
  },
  render: (args) => {
    activeArgs = args;
    return { props: {} };
  },
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: route },
        { provide: AuthService, useValue: { isAuthenticated: signal(false) } },
        {
          provide: SportsViewerRealtimeService,
          useValue: {
            watchTournament: (): Observable<never> =>
              activeArgs.liveConnectionLost
                ? timer(80).pipe(mergeMap(() => throwError(() => new Error('SSE disconnected'))))
                : NEVER,
          },
        },
      ],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    msw: {
      handlers: [
        http.post('/api/graphql', async () => {
          if (activeArgs.loadMode === 'loading') {
            await delay('infinite');
          }
          if (activeArgs.loadMode === 'error') {
            return HttpResponse.json({
              errors: [{ message: 'O torneio não está disponível para visualização.' }],
            });
          }
          return HttpResponse.json({
            data: { publicSportsTournamentDetail: controlledTournament() },
          });
        }),
      ],
    },
  },
};

export default meta;
type Story = StoryObj<TournamentStoryArgs>;

export const Playground: Story = {};

export const MultiSportWithEveryFormat: Story = {
  name: 'Multiesportivo com formatos variados',
  args: { multiSport: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'InterFCT 2026' })).toBeVisible();
    await expect(canvas.getByRole('tab', { name: /Futebol feminino/ })).toBeVisible();
    await expect(canvas.getByRole('tab', { name: /Xadrez rápido/ })).toBeVisible();
    await expect(canvas.getByRole('tab', { name: /Natação 50 m livre/ })).toBeVisible();
  },
};

export const LiveTournament: Story = {
  name: 'Partida ao vivo e próximas partidas',
  args: { multiSport: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Ao vivo')).toBeVisible();
    await expect(canvas.getByText('Próximas partidas')).toBeVisible();
  },
};

export const OverallAndPerSportScoring: Story = {
  name: 'Pontuação geral e por modalidade',
  args: { showOverallScore: true },
};

export const WithoutOverallScoring: Story = {
  name: 'Somente vencedores por modalidade',
  args: { showOverallScore: false },
};

export const WithoutPublishedMatches: Story = {
  name: 'Sem partidas publicadas',
  parameters: {
    msw: {
      handlers: [
        http.post('/api/graphql', () =>
          HttpResponse.json({
            data: {
              publicSportsTournamentDetail: createSportsViewerTournament({
                matches: [],
                categories: [],
              }),
            },
          }),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Nenhuma próxima partida foi publicada.')).toBeVisible();
  },
};

export const WithoutTeams: Story = {
  name: 'Sem equipes publicadas',
  args: { showTeams: false },
};

export const LongTournamentName: Story = {
  name: 'Nome e conteúdo extensos',
  args: {
    name: 'Jogos Universitários Integrados de Ciência, Tecnologia, Cultura e Esportes da Região Oeste Paulista',
  },
};

export const ReconnectingLiveData: Story = {
  name: 'Atualização ao vivo interrompida',
  args: { liveConnectionLost: true },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/Atualizações ao vivo indisponíveis/)).toBeVisible();
  },
};

export const Loading: Story = {
  args: { loadMode: 'loading' },
};

export const LoadError: Story = {
  name: 'Erro recuperável',
  args: { loadMode: 'error' },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Não foi possível carregar o torneio')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  },
};
