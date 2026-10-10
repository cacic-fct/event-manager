import { withScenarioControls } from '@cacic-fct/shared-angular/storybook';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { NEVER, of } from 'rxjs';
import { expect, userEvent, within } from 'storybook/test';
import { SportsSelfSubscriptionPage } from './self-subscription-page';
import { SportsOperationsApiService } from './sports-operations-api.service';
import { SportsOperationsRealtimeService } from './sports-operations-realtime.service';
import { createCurrentUserTournamentOperations } from './sports-operations.fixtures';

type LoadMode = 'ready' | 'loading';

interface SelfSubscriptionStoryArgs {
  paymentRequired: boolean;
  emptyOptions: boolean;
  allowNoTeam: boolean;
  allowNoCategory: boolean;
  loadMode: LoadMode;
}

const defaultArgs: SelfSubscriptionStoryArgs = {
  paymentRequired: true,
  emptyOptions: false,
  allowNoTeam: false,
  allowNoCategory: false,
  loadMode: 'ready',
};

let activeArgs = defaultArgs;

const meta: Meta<SelfSubscriptionStoryArgs> = {
  component: SportsSelfSubscriptionPage,
  title: 'Public/Sports/Operations/Registration',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    paymentRequired: { control: 'boolean' },
    emptyOptions: { control: 'boolean' },
    allowNoTeam: { control: 'boolean' },
    allowNoCategory: { control: 'boolean' },
    loadMode: { control: 'inline-radio', options: ['ready', 'loading'] },
  },
  render: (args) => {
    activeArgs = args;
    return { props: {} };
  },
  decorators: [
    withScenarioControls<SelfSubscriptionStoryArgs>(),
    applicationConfig({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ tournamentId: 'interfct-2026' }),
              queryParamMap: convertToParamMap({}),
            },
          },
        },
        {
          provide: SportsOperationsApiService,
          useValue: {
            currentUserApplications: () => of([]),
            tournament: () => {
              if (activeArgs.loadMode === 'loading') {
                return NEVER;
              }
              return of(
                createCurrentUserTournamentOperations({
                  paymentRequired: activeArgs.paymentRequired,
                  empty: activeArgs.emptyOptions,
                  allowNoTeam: activeArgs.allowNoTeam,
                  allowNoCategory: activeArgs.allowNoCategory,
                }),
              );
            },
            submitApplication: () => of('application-story'),
          },
        },
        {
          provide: SportsOperationsRealtimeService,
          useValue: { watchCurrentUserApplications: () => NEVER },
        },
      ],
    }),
  ],
  parameters: { layout: 'fullscreen', a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<SelfSubscriptionStoryArgs>;

export const Playground: Story = {};

export const PaidTournament: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Inscrever-se não garante sua escalação')).toBeVisible();
    await expect(canvas.getByLabelText('Faixa de pagamento')).toBeVisible();
    await expect(canvas.getByText(/pagamento só será liberado após a aprovação/)).toBeVisible();
  },
};

export const FreeTournament: Story = {
  args: { paymentRequired: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: /InterFCT 2026/, level: 2 })).toBeVisible();
    await expect(canvas.queryByLabelText('Faixa de pagamento')).not.toBeInTheDocument();
  },
};

export const MultipleSportsSelection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Futsal')).toBeVisible();
    await expect(canvas.getByText('Vôlei')).toBeVisible();
    await expect(canvas.getByText('Xadrez rápido')).toBeVisible();
  },
};

export const SuccessfulRequest: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByLabelText('Equipe desejada'));
    const body = within(document.body);
    const teamOption = await body.findByRole('option', { name: /Engenharia Atlética/ });
    await expect(teamOption.querySelector('lib-sports-team-logo')).toBeInTheDocument();
    await userEvent.click(teamOption);
    await expect(
      canvas.getByRole('combobox', { name: 'Equipe desejada' }).querySelector('lib-sports-team-logo'),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByLabelText('Faixa de pagamento'));
    await userEvent.click(await body.findByRole('option', { name: /Estudante/ }));
    await userEvent.click(canvas.getByText('Futsal'));
    await userEvent.click(canvas.getByText(/Li e entendi/));
    await userEvent.click(canvas.getByLabelText(/contrato de licença de uso de imagem/));
    const submitButton = canvas.getByRole('button', { name: 'Enviar solicitação' });
    await expect(submitButton).toBeEnabled();
    await userEvent.click(submitButton);
    await expect(await canvas.findByRole('heading', { name: 'Solicitação enviada' })).toBeVisible();
  },
};

export const NoTeamsOrSports: Story = {
  args: { emptyOptions: true, paymentRequired: false },
};

export const MerchandiseOnly: Story = {
  args: {
    allowNoTeam: true,
    allowNoCategory: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByLabelText('Equipe desejada'));
    const body = within(document.body);
    await expect(await body.findByRole('option', { name: 'Sem equipe específica' })).toBeVisible();
    await expect(canvas.getByText(/apenas para adquirir a camiseta/)).toBeVisible();
  },
};

export const Loading: Story = {
  args: { loadMode: 'loading' },
};
