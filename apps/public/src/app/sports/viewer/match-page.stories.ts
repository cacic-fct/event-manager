import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { delay, HttpResponse, http } from 'msw';
import { NEVER, Observable, of, throwError, timer } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import type { SportsMatchState } from '@cacic-fct/shared-data-types';
import { SportsMatchPage } from './match-page';
import { SportsViewerRealtimeService } from './sports-viewer-realtime.service';
import { createSportsViewerMatchForState, createSportsViewerRoster } from './sports-viewer.fixtures';

type LoadMode = 'ready' | 'loading' | 'error';

interface MatchStoryArgs {
  state: SportsMatchState;
  homeScore: number;
  awayScore: number;
  showPeriods: boolean;
  showOfficials: boolean;
  provideRosterData: boolean;
  loadMode: LoadMode;
  liveConnectionLost: boolean;
  livestream: 'NONE' | 'YOUTUBE' | 'TWITCH' | 'GENERAL';
  homeTeamName: string;
  awayTeamName: string;
  institution: string;
  venueName: string;
  courtLabel: string;
  latencyMs: number;
}

const defaultArgs: MatchStoryArgs = {
  state: 'LIVE',
  homeScore: 2,
  awayScore: 1,
  showPeriods: true,
  showOfficials: true,
  provideRosterData: true,
  loadMode: 'ready',
  liveConnectionLost: false,
  livestream: 'YOUTUBE',
  homeTeamName: 'Atlética FCT',
  awayTeamName: 'Ciência da Computação',
  institution: 'FCT-Unesp',
  venueName: 'Ginásio da FCT',
  courtLabel: 'Quadra principal',
  latencyMs: 120,
};

let activeArgs = defaultArgs;

const route = {
  paramMap: of(convertToParamMap({ matchId: 'partida-ao-vivo' })),
  snapshot: { paramMap: convertToParamMap({ matchId: 'partida-ao-vivo' }) },
};

function controlledMatch() {
  const match = createSportsViewerMatchForState(activeArgs.state);
  return {
    ...match,
    homeTeam: { ...match.homeTeam, name: activeArgs.homeTeamName, institution: activeArgs.institution },
    awayTeam: { ...match.awayTeam, name: activeArgs.awayTeamName, institution: activeArgs.institution },
    schedule: {
      ...match.schedule,
      venueName: activeArgs.venueName,
      courtLabel: activeArgs.courtLabel,
    },
    scoreboard: {
      ...match.scoreboard,
      homeScore: activeArgs.homeScore,
      awayScore: activeArgs.awayScore,
      periods: activeArgs.showPeriods ? match.scoreboard.periods : [],
    },
    officials: activeArgs.showOfficials ? match.officials : [],
    rosters: activeArgs.provideRosterData ? createSportsViewerRoster() : [],
    livestreamProvider: activeArgs.livestream === 'NONE' ? null : activeArgs.livestream,
    livestreamUrl:
      activeArgs.livestream === 'NONE'
        ? null
        : activeArgs.livestream === 'TWITCH'
          ? 'https://www.twitch.tv/cacic'
          : 'https://www.youtube.com/watch?v=storybook-sports',
  };
}

const meta: Meta<MatchStoryArgs> = {
  component: SportsMatchPage,
  title: 'CACiC Eventos/Sports/Viewer/Match',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    state: {
      control: 'select',
      options: ['SCHEDULED', 'CHECK_IN', 'LIVE', 'PAUSED', 'AWAITING_REVIEW', 'CANCELED', 'DRAW', 'FINISHED'],
    },
    homeScore: { control: { type: 'number', min: 0, max: 999 } },
    awayScore: { control: { type: 'number', min: 0, max: 999 } },
    showPeriods: { control: 'boolean' },
    showOfficials: { control: 'boolean' },
    provideRosterData: { control: 'boolean' },
    loadMode: { control: 'inline-radio', options: ['ready', 'loading', 'error'] },
    liveConnectionLost: { control: 'boolean' },
    livestream: {
      control: 'select',
      options: ['NONE', 'YOUTUBE', 'TWITCH', 'GENERAL'],
    },
    homeTeamName: { control: 'text' },
    awayTeamName: { control: 'text' },
    institution: { control: 'text' },
    venueName: { control: 'text' },
    courtLabel: { control: 'text' },
    latencyMs: { control: { type: 'range', min: 0, max: 2_000, step: 100 } },
  },
  render: (args) => {
    activeArgs = args;
    return { props: {} };
  },
  decorators: [
    applicationConfig({
      providers: [
        { provide: ActivatedRoute, useValue: route },
        {
          provide: SportsViewerRealtimeService,
          useValue: {
            watchMatch: (): Observable<never> =>
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
      handlers: {
        graphql: [
          http.post('/api/graphql', async () => {
            if (activeArgs.loadMode === 'loading') {
              await delay('infinite');
            }
            if (activeArgs.latencyMs > 0) {
              await delay(activeArgs.latencyMs);
            }
            if (activeArgs.loadMode === 'error') {
              return HttpResponse.json({
                errors: [{ message: 'A partida não está disponível para visualização.' }],
              });
            }
            return HttpResponse.json({
              data: { publicSportsMatchDetail: controlledMatch() },
            });
          }),
        ],
      },
    },
  },
};

export default meta;
type Story = StoryObj<MatchStoryArgs>;

export const Playground: Story = {};

export const Scheduled: Story = {
  name: 'Agendada',
  args: { state: 'SCHEDULED', homeScore: 0, awayScore: 0 },
};

export const AthleteCheckIn: Story = {
  name: 'Check-in sem exposição do elenco',
  args: { state: 'CHECK_IN', homeScore: 0, awayScore: 0, provideRosterData: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Check-in')).toBeVisible();
    await expect(canvas.getByText(/escalações ficam públicas somente/)).toBeVisible();
    await expect(canvas.queryByText('Ana Souza')).not.toBeInTheDocument();
  },
};

export const Live: Story = {
  name: 'Ao vivo',
  args: { state: 'LIVE' },
};

export const TwitchLivestream: Story = {
  name: 'Transmissão na Twitch',
  args: { state: 'LIVE', livestream: 'TWITCH' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('link', { name: 'Assistir na Twitch' })).toHaveAttribute(
      'href',
      'https://www.twitch.tv/cacic',
    );
  },
};

export const Paused: Story = {
  name: 'Pausada',
  args: { state: 'PAUSED' },
};

export const AwaitingReview: Story = {
  name: 'Resultado aguardando revisão',
  args: { state: 'AWAITING_REVIEW' },
};

export const Canceled: Story = {
  name: 'Cancelada para remarcação',
  args: { state: 'CANCELED', homeScore: 0, awayScore: 0 },
};

export const DrawToBeRescheduled: Story = {
  name: 'Empate com remarcação',
  args: { state: 'DRAW', homeScore: 2, awayScore: 2 },
};

export const FinishedWithPrivacySafeRoster: Story = {
  name: 'Finalizada com elenco anonimizado',
  args: { state: 'FINISHED', provideRosterData: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Ana Souza')).toBeVisible();
    await expect(canvas.queryByText('Ana Beatriz de Souza')).not.toBeInTheDocument();
    await expect(canvas.getByText('Mariana S.')).toBeVisible();
  },
};

export const WithoutOfficialsOrPeriods: Story = {
  name: 'Sem oficiais nem períodos',
  args: { showOfficials: false, showPeriods: false },
};

export const LargeScore: Story = {
  name: 'Placar com números extensos',
  args: { state: 'LIVE', homeScore: 128, awayScore: 117 },
};

export const ReconnectingLiveData: Story = {
  name: 'Atualização ao vivo interrompida',
  args: { liveConnectionLost: true },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/Atualizações ao vivo indisponíveis/)).toBeVisible();
  },
};

export const Loading: Story = {
  args: { loadMode: 'loading', latencyMs: 0 },
};

export const LongTeamAndVenueNamesMobile: Story = {
  args: {
    homeTeamName: 'Associação Atlética Acadêmica de Ciência e Tecnologia de Presidente Prudente',
    awayTeamName: 'Equipe Interdisciplinar de Computação, Estatística e Engenharia Ambiental',
    institution: 'Universidade Estadual Paulista Júlio de Mesquita Filho',
    venueName: 'Complexo esportivo universitário e centro de convivência estudantil',
    courtLabel: 'Quadra poliesportiva principal - setor norte',
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', motion: 'reduced' },
};

export const LoadError: Story = {
  name: 'Erro recuperável',
  args: { loadMode: 'error' },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Não foi possível carregar a partida')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  },
};
