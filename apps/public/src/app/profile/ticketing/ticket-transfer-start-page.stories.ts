import { withScenarioControls } from '@cacic-fct/shared-angular/storybook';
import { MatSnackBar } from '@angular/material/snack-bar';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { EMPTY, NEVER, of } from 'rxjs';
import { expect, userEvent, within } from 'storybook/test';
import { TicketingApiService } from './ticketing-api.service';
import { TicketTransferStartPage } from './ticket-transfer-start-page';
import { createTicketStoryTransfer, createTicketStoryTransferLists } from './ticketing-story-fixtures';
import { createWalletStoryTicket } from '../wallet/testing/wallet-story-fixtures';

type TicketTransferStartStoryArgs = {
  mode: 'new' | 'pending' | 'expired';
  identityKind: 'cpf' | 'passport' | 'missing';
  ticketName: string;
  ticketEmoji: string;
  description: string;
  eligibilityDescription: string;
  apiState: 'ready' | 'loading';
};

const meta: Meta<TicketTransferStartStoryArgs> = {
  component: TicketTransferStartPage,
  title: 'Public/Ticketing/Transfers/Start',
  tags: ['autodocs', 'ticketing'],
  parameters: { layout: 'fullscreen', a11y: { test: 'error' } },
  args: {
    mode: 'new',
    identityKind: 'cpf',
    ticketName: 'Festa de encerramento',
    ticketEmoji: '🎉',
    description: 'Acesso à festa de encerramento do congresso.',
    eligibilityDescription: 'Para pessoas inscritas no Congresso de Computação.',
    apiState: 'ready',
  },
  argTypes: {
    mode: { control: 'select', options: ['new', 'pending', 'expired'] },
    identityKind: { control: 'select', options: ['cpf', 'passport', 'missing'] },
    ticketName: { control: 'text' },
    ticketEmoji: { control: 'text' },
    description: { control: 'text' },
    eligibilityDescription: { control: 'text' },
    apiState: { control: 'select', options: ['ready', 'loading'] },
  },
  decorators: [
    withScenarioControls<TicketTransferStartStoryArgs>(),
    (story, context) => {
      const ticket = createWalletStoryTicket(
        {
          name: context.args.ticketName,
          emoji: context.args.ticketEmoji,
          description: context.args.description || null,
          transferEligibilityDescription: context.args.eligibilityDescription || null,
          event: {
            ...createWalletStoryTicket().event,
            name: context.args.ticketName,
            emoji: context.args.ticketEmoji,
          },
          ...(context.args.mode === 'expired'
            ? { status: 'EXPIRED', effectiveExpiresAt: new Date(Date.now() - 1000).toISOString() }
            : {}),
        },
      );
      const pendingTransfer = createTicketStoryTransfer({
        ticket,
        recipient: null,
        submittedDestinationIdentityDocument: 'XK7654321',
        canCancel: true,
      });
      const ticketResponse = context.args.apiState === 'loading'
        ? NEVER
        : of(ticket);
      const transferResponse = of(createTicketStoryTransferLists({
            outgoing: context.args.mode === 'pending' ? [pendingTransfer] : [],
          }));

      return applicationConfig({
        providers: [
          provideRouter([]),
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: { paramMap: convertToParamMap({ ticketId: ticket.id }) },
              paramMap: of(convertToParamMap({ ticketId: ticket.id })),
            },
          },
          {
            provide: AuthService,
            useValue: {
              user: () => ({
                sub: 'ticket-sender-user',
                claims: {
                  name: 'Marina da Silva',
                      picture: 'https://lh3.googleusercontent.com/a/story-user=s96-c',
                  identity_document: context.args.identityKind === 'cpf'
                    ? '52998224725'
                    : context.args.identityKind === 'passport'
                      ? 'XK1234567'
                      : '',
                },
              }),
            },
          },
          {
            provide: TicketingApiService,
            useValue: {
              myWalletTicket: () => ticketResponse,
              myTicketTransfers: () => transferResponse,
              startTicketTransfer: (_ticketId: string, document: string) =>
                of(createTicketStoryTransfer({
                  ticket,
                  recipient: null,
                  submittedDestinationIdentityDocument: document,
                })),
              cancelTicketTransfer: () => of(pendingTransfer),
              watchCurrentUser: () => EMPTY,
            },
          },
          { provide: MatSnackBar, useValue: { open: () => undefined } },
        ],
      })(story, context);
    },
  ],
};

export default meta;

type Story = StoryObj<TicketTransferStartStoryArgs>;

export const Playground: Story = {
  args: { mode: 'new', apiState: 'ready', identityKind: 'cpf' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('textbox', { name: 'CPF ou passaporte' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Enviar bilhete' })).toBeDisabled();
  },
};

export const DocumentEntry: Story = {
  args: { mode: 'new' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('textbox', { name: 'CPF ou passaporte' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Enviar bilhete' })).toBeDisabled();
  },
};

export const NewRequest: Story = {
  args: { mode: 'new' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole('textbox', { name: 'CPF ou passaporte' });
    await userEvent.type(input, '529.982.247-25');
    await userEvent.click(canvas.getByRole('button', { name: 'Enviar bilhete' }));
    await expect(await canvas.findByText('52998224725')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Cancelar pedido' })).toBeVisible();
  },
};

export const PendingRequest: Story = {
  args: { mode: 'pending' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const cancel = await canvas.findByRole('button', { name: 'Cancelar pedido' });
    await expect(cancel).toBeEnabled();
  },
};

export const ExpiredTicket: Story = {
  args: { mode: 'expired' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Este bilhete expirou e não pode mais ser transferido.')).toBeVisible();
    await expect(canvas.queryByRole('textbox', { name: 'CPF ou passaporte' })).toBeNull();
  },
};

export const InvalidCpf: Story = {
  args: { mode: 'new' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole('textbox', { name: 'CPF ou passaporte' });
    await userEvent.type(input, '123.456.789-01');
    await userEvent.tab();
    await expect(canvas.getByText('Digite um CPF válido ou informe o passaporte.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Enviar bilhete' })).toBeDisabled();
  },
};

export const PassportOwner: Story = {
  args: { identityKind: 'passport' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('XK1234567')).toBeVisible();
    const input = await canvas.findByRole('textbox', { name: 'CPF ou passaporte' });
    await userEvent.type(input, 'XK7654321');
    await userEvent.click(canvas.getByRole('button', { name: 'Enviar bilhete' }));
    await expect(await canvas.findByText('XK7654321')).toBeVisible();
  },
};

export const MissingOwnerDocument: Story = {
  args: { identityKind: 'missing' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Documento não informado')).toBeVisible();
    await expect(canvas.getByText(/não informaremos se o documento está cadastrado/i)).toBeVisible();
  },
};

export const Loading: Story = {
  args: { apiState: 'loading' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('progressbar', { name: 'Carregando bilhete' })).toBeVisible();
  },
};
