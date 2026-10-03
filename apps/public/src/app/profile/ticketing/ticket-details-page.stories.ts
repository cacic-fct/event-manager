import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { EMPTY, NEVER, of, throwError } from 'rxjs';
import { expect, within } from 'storybook/test';
import { createWalletStoryTicket } from '../wallet/testing/wallet-story-fixtures';
import { TicketingApiService } from './ticketing-api.service';
import { TicketDetailsPage } from './ticket-details-page';

type TicketDetailsStoryArgs = {
  publiclyVisible: boolean;
  status: 'ACTIVE' | 'CONSUMED' | 'EXPIRED' | 'REVOKED' | 'UNAVAILABLE';
  transferable: boolean;
  ticketName: string;
  ticketEmoji: string;
  description: string;
  eligibilityDescription: string;
  apiState: 'ready' | 'loading' | 'empty' | 'error';
};

const meta: Meta<TicketDetailsStoryArgs> = {
  component: TicketDetailsPage,
  title: 'CACiC Eventos/Tickets/Information',
  tags: ['autodocs', 'ticketing'],
  parameters: { layout: 'fullscreen', a11y: { test: 'error' } },
  args: {
    publiclyVisible: true,
    status: 'ACTIVE',
    transferable: true,
    ticketName: 'Festa de encerramento',
    ticketEmoji: '🎉',
    description: 'Acesso à festa de encerramento do congresso.',
    eligibilityDescription: 'Para pessoas inscritas no Congresso de Computação.',
    apiState: 'ready',
  },
  argTypes: {
    publiclyVisible: { control: 'boolean' },
    status: { control: 'select', options: ['ACTIVE', 'CONSUMED', 'EXPIRED', 'REVOKED', 'UNAVAILABLE'] },
    transferable: { control: 'boolean' },
    ticketName: { control: 'text' },
    ticketEmoji: { control: 'text' },
    description: { control: 'text' },
    eligibilityDescription: { control: 'text' },
    apiState: { control: 'select', options: ['ready', 'loading', 'empty', 'error'] },
  },
  decorators: [
    (story, context) => {
      const ticketResponse = context.args.apiState === 'loading'
        ? NEVER
        : context.args.apiState === 'empty'
          ? of(null)
          : context.args.apiState === 'error'
            ? throwError(() => new Error('Falha ao carregar o bilhete.'))
            : null;
      const ticket = createWalletStoryTicket({
        name: context.args.ticketName,
        emoji: context.args.ticketEmoji,
        description: context.args.description || null,
        transferEligibilityDescription: context.args.eligibilityDescription || null,
        status: context.args.status,
        transferable: context.args.transferable,
        event: {
          ...createWalletStoryTicket().event,
          name: context.args.ticketName,
          emoji: context.args.ticketEmoji,
          publicUrl: context.args.publiclyVisible ? '/event/party-event' : null,
        },
      });
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
            provide: TicketingApiService,
            useValue: { myWalletTicket: () => ticketResponse ?? of(ticket), watchCurrentUser: () => EMPTY },
          },
        ],
      })(story, context);
    },
  ],
};

export default meta;

type Story = StoryObj<TicketDetailsStoryArgs>;

export const Playground: Story = {
  args: { apiState: 'ready' },
  globals: { theme: 'light', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Festa de encerramento')).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Transferir bilhete' })).toBeVisible();
  },
};

export const Transferable: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Sobre este bilhete')).toBeVisible();
    await expect(canvas.getByText(/Para pessoas inscritas/)).toBeVisible();
    await expect(canvas.getByRole('link', { name: /abrir evento festa de encerramento/i })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Transferir bilhete' })).toBeVisible();
  },
};

export const HiddenEvent: Story = {
  args: { publiclyVisible: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Festa de encerramento')).toBeVisible();
    await expect(canvas.queryByRole('link', { name: /abrir evento festa de encerramento/i })).toBeNull();
  },
};

export const UsedTicket: Story = {
  args: { status: 'CONSUMED', transferable: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Utilizado')).toBeVisible();
    await expect(canvas.queryByRole('link', { name: 'Transferir bilhete' })).toBeNull();
  },
};

export const ExpiredTicket: Story = {
  args: { status: 'EXPIRED', transferable: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Expirado')).toBeVisible();
    await expect(canvas.queryByRole('link', { name: 'Transferir bilhete' })).toBeNull();
  },
};

export const NotTransferable: Story = {
  args: { transferable: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Festa de encerramento')).toBeVisible();
    await expect(canvas.getByText('Para pessoas inscritas no Congresso de Computação.')).toBeVisible();
    await expect(canvas.queryByRole('link', { name: 'Transferir bilhete' })).toBeNull();
  },
};

export const DarkReducedMotion: Story = {
  args: { status: 'REVOKED', transferable: false },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Revogado')).toBeVisible();
  },
};

export const Loading: Story = {
  args: { apiState: 'loading' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('progressbar', { name: 'Carregando informações do bilhete' })).toBeVisible();
  },
};

export const MissingTicket: Story = {
  args: { apiState: 'empty' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Este bilhete não está disponível.')).toBeVisible();
  },
};

export const LoadError: Story = {
  args: { apiState: 'error' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Não foi possível carregar as informações deste bilhete.')).toBeVisible();
  },
};

export const Unavailable: Story = {
  args: { status: 'UNAVAILABLE', transferable: false },
};
