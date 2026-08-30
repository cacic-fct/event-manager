import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { NEVER, of, throwError } from 'rxjs';
import { expect, userEvent, within } from 'storybook/test';
import { SportsOperationsApiService } from './sports-operations-api.service';
import { SportsViewerRealtimeService } from '../viewer/sports-viewer-realtime.service';
import { createRepresentativeTeamWorkspace, createSportsLineupRead } from './sports-operations.fixtures';
import type { RepresentativeTeamChange } from './sports-operations.types';
import { SportsTeamOperationsPage } from './team-operations-page';

type LoadMode = 'ready' | 'loading' | 'error';
type LineupMode = 'ready' | 'empty' | 'error';

interface TeamOperationsStoryArgs {
  requestStatus: RepresentativeTeamChange['status'];
  loadMode: LoadMode;
  lineupMode: LineupMode;
}

const defaultArgs: TeamOperationsStoryArgs = {
  requestStatus: 'PENDING',
  loadMode: 'ready',
  lineupMode: 'ready',
};

let activeArgs = defaultArgs;

const meta: Meta<TeamOperationsStoryArgs> = {
  component: SportsTeamOperationsPage,
  title: 'CACiC Eventos/Sports/Operations/Team',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    requestStatus: {
      control: 'select',
      options: ['PENDING', 'CHANGES_REQUESTED', 'CONFLICT', 'APPROVED', 'REJECTED', 'SUPERSEDED'],
    },
    loadMode: { control: 'inline-radio', options: ['ready', 'loading', 'error'] },
    lineupMode: { control: 'inline-radio', options: ['ready', 'empty', 'error'] },
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
              paramMap: convertToParamMap({ teamId: 'team-home' }),
              queryParamMap: convertToParamMap({
                matchId: 'match-story',
                registrationId: 'registration-home',
              }),
            },
          },
        },
        {
          provide: SportsOperationsApiService,
          useValue: {
            representativeWorkspace: () => {
              if (activeArgs.loadMode === 'loading') {
                return NEVER;
              }
              if (activeArgs.loadMode === 'error') {
                return throwError(() => new Error('Você não tem acesso à gestão desta equipe.'));
              }
              return of(createRepresentativeTeamWorkspace(activeArgs.requestStatus));
            },
            lineup: () => {
              if (activeArgs.lineupMode === 'error') {
                return throwError(() => new Error('A escalação mudou em outro dispositivo.'));
              }
              return of(createSportsLineupRead({ empty: activeArgs.lineupMode === 'empty' }));
            },
            submitTeamChange: () => of('change-story'),
            uploadTeamLogo: () =>
              of({
                requestId: 'logo-change-story',
                requestRevision: 1,
                sha256: 'a'.repeat(64),
                mimeType: 'image/avif',
                sizeBytes: 128,
                width: 64,
                height: 64,
              }),
            submitRoster: () => of('roster-story'),
            forfeit: () => of('forfeit-story'),
            reviewTeamApplication: () => of('application-story'),
          },
        },
        {
          provide: SportsViewerRealtimeService,
          useValue: { watchMatch: () => NEVER },
        },
      ],
    }),
  ],
  parameters: { layout: 'fullscreen', a11y: { test: 'todo' } },
};

export default meta;
type Story = StoryObj<TeamOperationsStoryArgs>;

export const Playground: Story = {};

export const PendingProfileDelta: Story = {
  name: 'Delta pendente pré-preenchido',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByDisplayValue('Engenharia Atlética Renovada')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Atualizar pedido pendente' })).toBeVisible();
  },
};

export const AthleteIdentityRequest: Story = {
  name: 'Inclusão sem enumeração de pessoa',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('tab', { name: 'Integrantes' }));
    await expect(canvas.getByText(/Informe apenas um identificador por vez/)).toBeVisible();
  },
};

export const OverallMembersAndJoinQueue: Story = {
  name: 'Integrantes e contagem da fila sem dados pessoais',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('tab', { name: 'Integrantes' }));
    await expect(canvas.getByRole('heading', { name: 'Pessoas da equipe' })).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Solicitações para entrar' })).toBeVisible();
    await expect(canvas.getByRole('status', { name: '1 pessoa aguardando análise da organização' })).toBeVisible();
    await expect(canvas.queryByText('Mariana Luiza Ferreira')).not.toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'Recusar' })).not.toBeInTheDocument();
  },
};

export const QueuedTeamLogo: Story = {
  name: 'Escudo privado aguardando aprovação',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const file = new File(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M32 5 52 12v18c0 13-8 24-20 29C20 54 12 43 12 30V12z"/></svg>',
      ],
      'escudo.svg',
      { type: 'image/svg+xml' },
    );
    await userEvent.upload(await canvas.findByLabelText('Escolher arquivo'), file);
    await expect(canvas.getByText('escudo.svg')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Enviar escudo' })).toBeEnabled();
  },
};

export const MatchLineup: Story = {
  name: 'Escalação por partida',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('tab', { name: 'Escalação por partida' }));
    await expect(canvas.getByText('Ana Beatriz de Souza')).toBeVisible();
    await expect(canvas.getAllByRole('combobox', { name: 'Função' })[0]).toBeVisible();
    await expect(canvas.getAllByRole('textbox', { name: 'Camisa' })[0]).toHaveValue('10');
    await expect(canvas.getByRole('button', { name: 'Enviar escalação' })).toBeEnabled();
    await expect(canvas.getByRole('button', { name: 'Desistir desta partida' })).toBeEnabled();
    await userEvent.click(canvas.getByRole('combobox', { name: 'Partida' }));
    const overlay = within(document.body);
    const matchOption = await overlay.findByRole('option', { name: /Engenharia Atlética.*Direito XI/ });
    await expect(matchOption.querySelector('lib-twemoji')).toBeInTheDocument();
    await expect(matchOption.querySelectorAll('lib-sports-team-logo')).toHaveLength(2);
    await userEvent.keyboard('{Escape}');
  },
};

export const EmptyEligibleLineup: Story = {
  name: 'Sem atletas elegíveis',
  args: { lineupMode: 'empty' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('tab', { name: 'Escalação por partida' }));
    await expect(canvas.getByText(/lista de atletas elegíveis ainda não está disponível/)).toBeVisible();
  },
};

export const LineupConflict: Story = {
  name: 'Erro de concorrência na escalação',
  args: { lineupMode: 'error' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('tab', { name: 'Escalação por partida' }));
    await expect(canvas.getByText('A escalação mudou em outro dispositivo.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  },
};

export const ReadOnlyMatchLineup: Story = {
  name: 'Escalação em revisão somente leitura',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('tab', { name: 'Escalação por partida' }));
    await userEvent.click(canvas.getByRole('combobox', { name: 'Partida' }));
    const options = within(document.body);
    await userEvent.click(await options.findByRole('option', { name: /Em revisão/ }));
    await expect(canvas.getByText('Esta partida não aceita mais alterações de escalação.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Enviar escalação' })).toBeDisabled();
  },
};

export const ChangeRequested: Story = {
  name: 'Ajustes solicitados',
  args: { requestStatus: 'CHANGES_REQUESTED' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('tab', { name: 'Acompanhamento' }));
    await expect(canvas.getByText('Ajustes solicitados')).toBeVisible();
    await expect(canvas.getByText('Confirme o nome oficial da instituição.')).toBeVisible();
  },
};

export const ConcurrentConflict: Story = {
  name: 'Conflito de edição',
  args: { requestStatus: 'CONFLICT' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('tab', { name: 'Acompanhamento' }));
    await expect(canvas.getByText('Conflito - revise os dados')).toBeVisible();
  },
};

export const ApprovedRequest: Story = {
  name: 'Pedido aprovado',
  args: { requestStatus: 'APPROVED' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('tab', { name: 'Acompanhamento' }));
    await expect(canvas.getByText('Aprovada')).toBeVisible();
  },
};

export const RejectedRequest: Story = {
  name: 'Pedido negado',
  args: { requestStatus: 'REJECTED' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('tab', { name: 'Acompanhamento' }));
    await expect(canvas.getByText('Negada')).toBeVisible();
  },
};

export const SupersededRequest: Story = {
  name: 'Pedido substituído',
  args: { requestStatus: 'SUPERSEDED' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('tab', { name: 'Acompanhamento' }));
    await expect(canvas.getByText('Substituída por outro pedido')).toBeVisible();
  },
};

export const Loading: Story = {
  args: { loadMode: 'loading' },
};

export const PermissionError: Story = {
  name: 'Acesso negado',
  args: { loadMode: 'error' },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Você não tem acesso à gestão desta equipe.')).toBeVisible();
  },
};
