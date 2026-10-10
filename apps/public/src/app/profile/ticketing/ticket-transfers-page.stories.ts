import { MatSnackBar } from '@angular/material/snack-bar';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { provideRouter } from '@angular/router';
import { EMPTY, NEVER, of } from 'rxjs';
import { expect, within } from 'storybook/test';
import { createTicketStoryTransfer, createTicketStoryTransferLists } from './ticketing-story-fixtures';
import { TicketingApiService } from './ticketing-api.service';
import { TicketTransfersPage } from './ticket-transfers-page';

type TicketTransfersStoryArgs = {
  mode: 'all' | 'empty' | 'system-ineligible' | 'system-duplicate' | 'admin' | 'loading';
};

const meta: Meta<TicketTransfersStoryArgs> = {
  component: TicketTransfersPage,
  title: 'CACiC Eventos/Tickets/Transfer Attempts',
  tags: ['autodocs', 'ticketing'],
  parameters: { layout: 'fullscreen', a11y: { test: 'error' } },
  args: { mode: 'all' },
  argTypes: {
    mode: { control: 'select', options: ['all', 'empty', 'system-ineligible', 'system-duplicate', 'admin', 'loading'] },
  },
  decorators: [
    (story, context) => {
      const pending = createTicketStoryTransfer({ id: 'incoming-pending' });
      const ignored = createTicketStoryTransfer({
        id: 'incoming-ignored',
        recipientStatus: context.args.mode === 'system-duplicate' ? 'SYSTEM_DUPLICATE' : 'SYSTEM_INELIGIBLE',
        ignoreReason: context.args.mode === 'system-duplicate' ? 'ALREADY_HELD' : 'INELIGIBLE',
        canAccept: false,
      });
      const adminPending = createTicketStoryTransfer({
        id: 'incoming-admin',
        initiatedByAdmin: true,
        initiatingAdmin: { personId: 'admin-1', firstName: 'Alex', avatarUrl: null },
      });
      const outgoing = createTicketStoryTransfer({
        id: 'outgoing-pending',
        recipient: null,
        submittedDestinationIdentityDocument: 'XK1234567',
      });
      const outgoingEligibilityHidden = createTicketStoryTransfer({
        id: 'outgoing-eligibility-private',
        ticket: {
          ...createTicketStoryTransfer().ticket,
          name: 'Kit de boas-vindas',
        },
        recipient: null,
        recipientStatus: 'SYSTEM_INELIGIBLE',
        ignoreReason: 'INELIGIBLE',
        submittedDestinationIdentityDocument: '52998224725',
        canAccept: false,
      });
      const transfers = createTicketStoryTransferLists({
        incomingPending: context.args.mode === 'all' ? [pending] : context.args.mode === 'admin' ? [adminPending] : [],
        incomingIgnored: context.args.mode === 'all' || context.args.mode === 'system-ineligible' || context.args.mode === 'system-duplicate'
          ? [ignored]
          : [],
        outgoing: context.args.mode === 'all' ? [outgoing, outgoingEligibilityHidden] : [],
      });
      const apiResult = context.args.mode === 'loading'
        ? NEVER
        : of(transfers);

      return applicationConfig({
        providers: [
          provideRouter([]),
          {
            provide: TicketingApiService,
            useValue: { myTicketTransfers: () => apiResult, watchCurrentUser: () => EMPTY },
          },
          { provide: MatSnackBar, useValue: { open: () => undefined } },
        ],
      })(story, context);
    },
  ],
};

export default meta;

type Story = StoryObj<TicketTransfersStoryArgs>;

export const Playground: Story = {
  args: { mode: 'all' },
  globals: { theme: 'light', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Aguardando sua resposta' })).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Pedidos ignorados' })).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Pedidos enviados' })).toBeVisible();
  },
};

export const AllAttemptGroups: Story = {
  args: { mode: 'all' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Aguardando sua resposta' })).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Pedidos ignorados' })).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Pedidos enviados' })).toBeVisible();
    await expect(canvas.getAllByText('Festa de encerramento').length).toBeGreaterThan(1);
    await expect(canvas.getAllByText('Aguardando resposta')).toHaveLength(2);
    await expect(canvas.queryByText('Pedido enviado')).toBeNull();
  },
};

export const Empty: Story = {
  args: { mode: 'empty' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Você ainda não tem pedidos de transferência de bilhetes.')).toBeVisible();
  },
};

export const SystemIneligible: Story = {
  args: { mode: 'system-ineligible' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Você não era elegível para receber este bilhete')).toBeVisible();
  },
};

export const AlreadyHeld: Story = {
  args: { mode: 'system-duplicate' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Este bilhete já estava na sua carteira')).toBeVisible();
  },
};

export const InitiatedByAdmin: Story = {
  args: { mode: 'admin' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Transferência iniciada por: Alex')).toBeVisible();
  },
};

export const Loading: Story = {
  args: { mode: 'loading' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('progressbar', { name: 'Carregando transferências' })).toBeVisible();
  },
};

export const DarkReducedMotion: Story = {
  args: { mode: 'system-duplicate' },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Este bilhete já estava na sua carteira')).toBeVisible();
  },
};
