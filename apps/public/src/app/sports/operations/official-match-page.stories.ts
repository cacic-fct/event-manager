import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { NEVER, of, throwError } from 'rxjs';
import { expect, userEvent, within } from 'storybook/test';
import { OfficialSportsMatchPage } from './official-match-page';
import { SportsOfflineQueueService } from './sports-offline-queue.service';
import { createLongNameOperationalMatch, createSportsOperationalMatch } from './sports-operations.fixtures';
import { SportsOperationsApiService } from './sports-operations-api.service';
import type { SportsMatchState, SportsOperationalMatch } from './sports-operations.types';
import { SportsViewerRealtimeService } from '../viewer/sports-viewer-realtime.service';

type LoadMode = 'ready' | 'loading' | 'error';
type RosterMode = 'full' | 'empty' | 'long-names';

interface OfficialMatchStoryArgs {
  state: SportsMatchState;
  loadMode: LoadMode;
  rosterMode: RosterMode;
  pendingOfflineActions: number;
}

const defaultArgs: OfficialMatchStoryArgs = {
  state: 'LIVE',
  loadMode: 'ready',
  rosterMode: 'full',
  pendingOfflineActions: 0,
};

let activeArgs = defaultArgs;

function currentMatch(): SportsOperationalMatch {
  if (activeArgs.rosterMode === 'long-names') {
    return createLongNameOperationalMatch(activeArgs.state);
  }
  return createSportsOperationalMatch(activeArgs.state, {
    rosters: activeArgs.rosterMode === 'empty'
      ? []
      : createSportsOperationalMatch(activeArgs.state).rosters,
  });
}

const meta: Meta<OfficialMatchStoryArgs> = {
  component: OfficialSportsMatchPage,
  title: 'CACiC Eventos/Sports/Operação da partida',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    state: {
      control: 'select',
      options: ['SCHEDULED', 'CHECK_IN', 'LIVE', 'PAUSED', 'AWAITING_REVIEW', 'CANCELED', 'DRAW', 'FINISHED'],
    },
    loadMode: { control: 'inline-radio', options: ['ready', 'loading', 'error'] },
    rosterMode: { control: 'inline-radio', options: ['full', 'empty', 'long-names'] },
    pendingOfflineActions: { control: { type: 'range', min: 0, max: 12, step: 1 } },
  },
  render: (args) => {
    activeArgs = args;
    return { props: {} };
  },
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ matchId: 'match-story' }),
              queryParamMap: convertToParamMap({ revision: '7' }),
            },
          },
        },
        {
          provide: SportsOperationsApiService,
          useValue: {
            match: () => {
              if (activeArgs.loadMode === 'loading') {
                return NEVER;
              }
              if (activeArgs.loadMode === 'error') {
                return throwError(() => new Error('A conexão com a mesa de controle foi interrompida.'));
              }
              return of(currentMatch());
            },
            checkIn: () => of(true),
            commit: () => of(['action-story']),
          },
        },
        {
          provide: SportsOfflineQueueService,
          useValue: {
            pending: signal([]),
            pendingForMatch: () => activeArgs.pendingOfflineActions,
            timerConflict: signal(null),
            start: () => undefined,
            sync: () => Promise.resolve(),
            dispatch: () => Promise.resolve(activeArgs.pendingOfflineActions ? 'queued' : 'sent'),
            dispatchCheckIn: () => Promise.resolve(activeArgs.pendingOfflineActions ? 'queued' : 'sent'),
            dispatchScannerCheckIn: () => Promise.resolve(activeArgs.pendingOfflineActions ? 'queued' : 'sent'),
            attachTimerSnapshot: () => undefined,
          },
        },
        {
          provide: SportsViewerRealtimeService,
          useValue: { watchMatch: () => NEVER },
        },
      ],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;
type Story = StoryObj<OfficialMatchStoryArgs>;

export const Playground: Story = {};

export const Scheduled: Story = {
  name: 'Agendada',
  args: { state: 'SCHEDULED' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Agendada')).toBeVisible();
    await expect(canvas.getByRole('button', { name: /pressione e segure para iniciar/i })).toBeVisible();
  },
};

export const AthleteCheckIn: Story = {
  name: 'Check-in de atletas',
  args: { state: 'CHECK_IN' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Check-in')).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Check-in dos atletas' })).toBeVisible();
    await expect(canvas.getByText('Ana Beatriz de Souza')).toBeVisible();
    await expect(canvas.getByText('Bruno Henrique Oliveira')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Escanear presença' })).toBeVisible();
  },
};

export const ShirtNumberOrderingDuringMatch: Story = {
  name: 'Check-in ordenado por camisa durante a partida',
  args: { state: 'LIVE' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const homeTeam = canvas.getByRole('region', { name: 'Atletas de Engenharia Atlética' });
    const athletes = within(homeTeam).getAllByRole('button');
    await expect(athletes[0]).toHaveTextContent('camisa 7');
    await expect(athletes[1]).toHaveTextContent('camisa 8');
    await expect(canvas.getByRole('button', { name: 'Editar check-in' })).toBeVisible();
  },
};

export const Live: Story = {
  name: 'Ao vivo',
  args: { state: 'LIVE' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Ao vivo')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Trocar os lados das equipes no placar' }));
    const headings = canvas.getAllByRole('heading', { level: 1 });
    await expect(headings[0]).toHaveTextContent('Direito XI');
    await userEvent.click(canvas.getByRole('button', { name: 'Novo período/rodada' }));
    await expect(canvas.getByText(/3º período/)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Desfazer novo período' }));
    await expect(canvas.queryByText(/3º período/)).not.toBeInTheDocument();
  },
};

export const OverlayBuilder: Story = {
  name: 'Builder do overlay para OBS',
  args: { state: 'LIVE' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Overlay para transmissão/i }));
    await expect(await canvas.findByText('Placar para transmissão')).toBeVisible();
    await expect(canvas.getByRole('combobox', { name: 'Equipe exibida' })).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: 'Link do overlay' })).toHaveValue(
      expect.stringContaining('/api/sports/public/matches/match-story/overlay'),
    );
  },
};

export const Paused: Story = {
  name: 'Pausada',
  args: { state: 'PAUSED' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Pausada')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Retomar cronômetro' })).toBeVisible();
  },
};

export const MatchOccurrences: Story = {
  name: 'Anotações e ocorrências',
  args: { state: 'LIVE' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/Camisa 7 saiu/)).toBeVisible();
    const note = canvas.getByRole('textbox', { name: 'O que aconteceu?' });
    await userEvent.type(note, 'Atendimento médico sem interrupção da partida.');
    await userEvent.click(canvas.getByRole('button', { name: 'Salvar anotação' }));
    await expect(canvas.getByText('Atendimento médico sem interrupção da partida.')).toBeVisible();
  },
};

export const AwaitingReview: Story = {
  name: 'Em revisão',
  args: { state: 'AWAITING_REVIEW' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/Check-in protegido após o início/)).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Editar check-in' })).toBeVisible();
  },
};

export const Canceled: Story = {
  name: 'Cancelada para remarcação',
  args: { state: 'CANCELED' },
};

export const Draw: Story = {
  name: 'Empate',
  args: { state: 'DRAW' },
};

export const Finished: Story = {
  name: 'Finalizada',
  args: { state: 'FINISHED' },
};

export const OfflineWithPendingActions: Story = {
  name: 'Offline com ações pendentes',
  args: { state: 'CHECK_IN', pendingOfflineActions: 4 },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole('button', { name: /4 pendente/ }),
    ).toBeVisible();
  },
};

export const EmptyRoster: Story = {
  name: 'Escalação indisponível',
  args: { state: 'CHECK_IN', rosterMode: 'empty' },
};

export const LongTeamAndAthleteNames: Story = {
  name: 'Nomes extensos',
  args: { state: 'CHECK_IN', rosterMode: 'long-names' },
};

export const Loading: Story = {
  args: { loadMode: 'loading' },
};

export const LoadError: Story = {
  name: 'Erro recuperável',
  args: { loadMode: 'error' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Não foi possível abrir a partida')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  },
};

export const FinalizationWizard: Story = {
  name: 'Finalização guiada',
  args: { state: 'LIVE' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Finalizar partida' }));
    const dialog = within(document.body);
    await expect(await dialog.findByRole('heading', { name: 'Finalizar esta partida?' })).toBeVisible();
    await userEvent.click(dialog.getByRole('button', { name: 'Sim, revisar resultado' }));
    await expect(canvas.getByText('Pausada')).toBeVisible();
    await expect(canvas.getByText(/Você está finalizando/)).toBeVisible();
    await expect(canvas.getByText('Nada será enviado sem a confirmação na última etapa.')).toBeVisible();
  },
};
