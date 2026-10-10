import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { EMPTY, NEVER, of, throwError } from 'rxjs';
import { expect, within } from 'storybook/test';
import { createTicketStoryTransfer } from './ticketing-story-fixtures';
import { TicketingApiService } from './ticketing-api.service';
import { TicketTransferDetailsPage } from './ticket-transfer-details-page';

type TicketTransferDetailsStoryArgs = {
  mode:
    | 'recipient'
    | 'admin'
    | 'admin-expired'
    | 'sender'
    | 'sender-expired'
    | 'ignored'
    | 'user-ignored'
    | 'system-ineligible'
    | 'system-duplicate'
    | 'accepted'
    | 'canceled'
    | 'transfer-expired'
    | 'expired';
  ticketName: string;
  ticketEmoji: string;
  description: string;
  eligibilityDescription: string;
  apiState: 'ready' | 'loading' | 'empty' | 'error';
};

const meta: Meta<TicketTransferDetailsStoryArgs> = {
  component: TicketTransferDetailsPage,
  title: 'CACiC Eventos/Tickets/Transfer Details',
  tags: ['autodocs', 'ticketing'],
  parameters: { layout: 'fullscreen', a11y: { test: 'error' } },
  args: {
    mode: 'recipient',
    ticketName: 'Festa de encerramento',
    ticketEmoji: '🎉',
    description: 'Acesso à festa de encerramento do congresso.',
    eligibilityDescription: 'Para pessoas inscritas no Congresso de Computação.',
    apiState: 'ready',
  },
  argTypes: {
    mode: {
      control: 'select',
      options: [
        'recipient',
        'admin',
        'admin-expired',
        'sender',
        'sender-expired',
        'ignored',
        'user-ignored',
        'system-ineligible',
        'system-duplicate',
        'accepted',
        'canceled',
        'transfer-expired',
        'expired',
      ],
    },
    ticketName: { control: 'text' },
    ticketEmoji: { control: 'text' },
    description: { control: 'text' },
    eligibilityDescription: { control: 'text' },
    apiState: { control: 'select', options: ['ready', 'loading', 'empty', 'error'] },
  },
  decorators: [
    (story, context) => {
      const baseTicket = createTicketStoryTransfer().ticket;
      const ticket = {
        ...baseTicket,
        name: context.args.ticketName,
        emoji: context.args.ticketEmoji,
        description: context.args.description || null,
        transferEligibilityDescription: context.args.eligibilityDescription || null,
        event: { ...baseTicket.event, name: context.args.ticketName, emoji: context.args.ticketEmoji },
        ...((context.args.mode === 'expired' || context.args.mode === 'admin-expired' || context.args.mode === 'sender-expired')
          ? { status: 'EXPIRED' as const, effectiveExpiresAt: new Date(Date.now() - 1000).toISOString() }
          : {}),
      };
      const ignored = ['ignored', 'user-ignored', 'system-ineligible', 'system-duplicate'].includes(context.args.mode);
      const ignoreReason = context.args.mode === 'user-ignored'
        ? 'USER_IGNORED'
        : context.args.mode === 'system-duplicate'
          ? 'ALREADY_HELD'
          : 'INELIGIBLE';
      const transfer = createTicketStoryTransfer({
        ticket,
        recipient: context.args.mode.startsWith('sender') ? null : createTicketStoryTransfer().recipient,
        submittedDestinationIdentityDocument: context.args.mode.startsWith('sender') ? 'XK1234567' : null,
        initiatedByAdmin: (context.args.mode === 'admin' || context.args.mode === 'admin-expired'),
        initiatingAdmin:
          (context.args.mode === 'admin' || context.args.mode === 'admin-expired')
            ? { personId: 'admin-1', firstName: 'Alex', avatarUrl: null }
            : null,
        senderStatus: context.args.mode === 'accepted'
          ? 'ACCEPTED'
          : context.args.mode === 'canceled'
            ? 'CANCELED'
            : context.args.mode === 'transfer-expired'
              ? 'EXPIRED'
              : 'PENDING',
        recipientStatus: ignored
          ? context.args.mode === 'user-ignored' || context.args.mode === 'ignored'
            ? 'IGNORED'
            : context.args.mode === 'system-duplicate'
              ? 'SYSTEM_DUPLICATE'
              : 'SYSTEM_INELIGIBLE'
          : context.args.mode === 'accepted'
            ? 'ACCEPTED'
            : 'PENDING',
        ignoreReason: ignored ? ignoreReason : null,
        canAccept: !ignored && context.args.mode !== 'sender' && context.args.mode !== 'expired' &&
          context.args.mode !== 'accepted' && context.args.mode !== 'canceled' && context.args.mode !== 'transfer-expired',
        canCancel: true,
      });
      const transferResponse = context.args.apiState === 'loading'
        ? NEVER
        : context.args.apiState === 'empty'
          ? of(null)
          : context.args.apiState === 'error'
            ? throwError(() => new Error('Falha ao carregar o pedido.'))
            : null;
      return applicationConfig({
        providers: [
          provideRouter([]),
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: { paramMap: convertToParamMap({ transferId: transfer.id }) },
              paramMap: of(convertToParamMap({ transferId: transfer.id })),
            },
          },
          {
            provide: AuthService,
            useValue: {
              user: () => ({
                sub: 'ticket-recipient-user',
                claims: {
                  name: 'João Pedro Oliveira',
                  picture: 'https://lh3.googleusercontent.com/a/story-recipient=s96-c',
                  identity_document: 'XK1234567',
                },
              }),
            },
          },
          {
            provide: TicketingApiService,
            useValue: { ticketTransfer: () => transferResponse ?? of(transfer), watchCurrentUser: () => EMPTY },
          },
          { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(false) }) } },
          { provide: MatSnackBar, useValue: { open: () => undefined } },
        ],
      })(story, context);
    },
  ],
};

export default meta;

type Story = StoryObj<TicketTransferDetailsStoryArgs>;

export const Playground: Story = {
  args: { mode: 'recipient', apiState: 'ready' },
  globals: { theme: 'light', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('button', { name: 'Receber bilhete' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Ignorar' })).toBeVisible();
  },
};

export const DarkReducedMotion: Story = {
  args: { mode: 'system-ineligible', apiState: 'ready' },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/Você não era elegível/)).toBeVisible();
  },
};

export const RecipientPending: Story = {
  args: { mode: 'recipient' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Marina da Silva')).toBeVisible();
    await expect(canvas.getByText('XK1234567')).toBeVisible();
    await expect(canvas.getByText('João Pedro Oliveira')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Receber bilhete' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Ignorar' })).toBeVisible();
  },
};

export const AdministrationInitiated: Story = {
  args: { mode: 'admin' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Transferência iniciada pela administração:')).toBeVisible();
    await expect(canvas.getByText('Alex')).toBeVisible();
  },
};

export const AutomaticallyIgnored: Story = {
  args: { mode: 'ignored' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/Você não era elegível para receber este bilhete/)).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Receber bilhete' })).toBeNull();
  },
};

export const UserIgnored: Story = {
  args: { mode: 'user-ignored' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/Você ignorou este pedido/)).toBeVisible();
  },
};

export const AlreadyHeld: Story = {
  args: { mode: 'system-duplicate' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/Este bilhete já estava na sua carteira/)).toBeVisible();
  },
};

export const Accepted: Story = {
  args: { mode: 'accepted' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Este bilhete foi recebido.')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Receber bilhete' })).toBeNull();
  },
};

export const Canceled: Story = {
  args: { mode: 'canceled' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Este pedido foi cancelado.')).toBeVisible();
  },
};

export const TransferExpired: Story = {
  args: { mode: 'transfer-expired' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Este pedido expirou.')).toBeVisible();
  },
};

export const SenderPending: Story = {
  args: { mode: 'sender' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Documento informado')).toBeVisible();
    await expect(canvas.getByText('XK1234567')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Cancelar pedido' })).toBeVisible();
  },
};

export const ExpiredBeforeAcceptance: Story = {
  args: { mode: 'expired' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Este bilhete expirou. Não é possível recebê-lo ou transferi-lo.')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Receber bilhete' })).toBeNull();
  },
};

export const Loading: Story = {
  args: { apiState: 'loading' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('progressbar', { name: 'Carregando pedido' })).toBeVisible();
  },
};

export const MissingRequest: Story = {
  args: { apiState: 'empty' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Este pedido de transferência não está disponível.')).toBeVisible();
  },
};

export const LoadError: Story = {
  args: { apiState: 'error' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Não foi possível carregar este pedido de transferência.')).toBeVisible();
  },
};

export const AdminExpiredBeforeAcceptance: Story = {
  args: { mode: 'admin-expired' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('button', { name: 'Receber bilhete' })).toBeVisible();
    await expect(canvas.queryByText('Este bilhete expirou. Não é possível recebê-lo ou transferi-lo.')).toBeNull();
  },
};

export const SenderExpired: Story = {
  args: { mode: 'sender-expired' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('button', { name: 'Cancelar pedido' })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Receber bilhete' })).toBeNull();
  },
};
