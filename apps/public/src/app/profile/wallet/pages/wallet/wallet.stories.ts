import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { AuthService } from '@cacic-fct/shared-angular';
import { TotpSeedSessionService } from '../../../../shared/totp/totp-seed-session.service';
import { createWalletStoryTotpSession, createWalletStoryUser } from '../../testing/wallet-story-fixtures';
import { Wallet } from './wallet';
import { NetworkStatusService } from '../../../../shared/network-status.service';
import { OfflineUserDataService } from '../../../../shared/offline-user-data.service';
import { TicketingApiService } from '../../../ticketing/ticketing-api.service';
import { createWalletStoryTicket } from '../../testing/wallet-story-fixtures';
import { EMPTY, of } from 'rxjs';

type WalletStoryArgs = {
  fullName: string;
  role: 'aluno-graduacao' | 'participant';
  enrollmentNumber: string;
  identityDocument: string;
  picture: string;
  authenticated: boolean;
  networkOnline: boolean;
  offlineSnapshotAvailable: boolean;
  includeEventTicket: boolean;
  includeExpiredTicket: boolean;
  archivedTicketStatus: 'CONSUMED' | 'EXPIRED' | 'REVOKED';
  archivedTicketName: string;
  ticketName: string;
  ticketEmoji: string;
  ticketDescription: string;
  eligibilityDescription: string;
  transferable: boolean;
  publiclyListed: boolean;
};

const defaultArgs: WalletStoryArgs = {
  fullName: 'Marina da Silva',
  role: 'aluno-graduacao',
  enrollmentNumber: '00123456',
  identityDocument: '52998224725',
  picture: '',
  authenticated: true,
  networkOnline: true,
  offlineSnapshotAvailable: true,
  includeEventTicket: false,
  includeExpiredTicket: false,
  archivedTicketStatus: 'CONSUMED',
  archivedTicketName: 'Kit de boas-vindas',
  ticketName: 'Festa de encerramento',
  ticketEmoji: '🎉',
  ticketDescription: 'Acesso à festa de encerramento do congresso.',
  eligibilityDescription: 'Para pessoas inscritas no Congresso de Computação.',
  transferable: true,
  publiclyListed: true,
};

const meta: Meta<WalletStoryArgs> = {
  component: Wallet,
  title: 'CACiC Eventos/Profile/Wallet/Page',
  tags: ['autodocs', 'ticketing'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
  args: defaultArgs,
  argTypes: {
    fullName: { control: 'text' },
    role: { control: 'select', options: ['aluno-graduacao', 'participant'] },
    enrollmentNumber: { control: 'text' },
    identityDocument: { control: 'text' },
    picture: { control: 'text' },
    authenticated: { control: 'boolean' },
    networkOnline: { control: 'boolean' },
    offlineSnapshotAvailable: { control: 'boolean' },
    includeEventTicket: { control: 'boolean' },
    includeExpiredTicket: { control: 'boolean' },
    archivedTicketStatus: { control: 'select', options: ['CONSUMED', 'EXPIRED', 'REVOKED'] },
    archivedTicketName: { control: 'text' },
    ticketName: { control: 'text' },
    ticketEmoji: { control: 'text' },
    ticketDescription: { control: 'text' },
    eligibilityDescription: { control: 'text' },
    transferable: { control: 'boolean' },
    publiclyListed: { control: 'boolean' },
  },
  decorators: [
    (story, context) =>
      applicationConfig({
        providers: [
          {
            provide: AuthService,
            useValue: {
              user: () =>
                context.args.authenticated
                  ? {
                      sub: createWalletStoryUser().userId,
                      claims: {
                        name: context.args.fullName,
                        picture: context.args.picture || null,
                        enrollment_number: context.args.enrollmentNumber,
                        unesp_role: context.args.role,
                        identity_document: context.args.identityDocument,
                      },
                    }
                  : null,
              isAuthenticated: () => context.args.authenticated,
            },
          },
          {
            provide: NetworkStatusService,
            useValue: { isOnline: () => context.args.networkOnline },
          },
          {
            provide: OfflineUserDataService,
            useValue: {
              getOfflineSnapshot: () =>
                Promise.resolve(
                  context.args.offlineSnapshotAvailable
                    ? {
                        userId: createWalletStoryUser().userId,
                        name: context.args.fullName,
                        picture: context.args.picture || null,
                        unespRole: context.args.role,
                        identityDocument: context.args.identityDocument,
                        enrollmentNumber: context.args.enrollmentNumber,
                      }
                    : null,
                ),
            },
          },
          {
            provide: TotpSeedSessionService,
            useValue: {
              ...createWalletStoryTotpSession(),
            },
          },
          {
            provide: TicketingApiService,
            useValue: {
              myWalletTickets: () => of([
                ...(context.args.includeEventTicket
                  ? [createWalletStoryTicket({
                      name: context.args.ticketName,
                      emoji: context.args.ticketEmoji,
                      description: context.args.ticketDescription || null,
                      transferEligibilityDescription: context.args.eligibilityDescription || null,
                      transferable: context.args.transferable,
                      event: {
                        ...createWalletStoryTicket().event,
                        name: context.args.ticketName,
                        emoji: context.args.ticketEmoji,
                        publicUrl: context.args.publiclyListed ? '/event/party-event' : null,
                      },
                    })]
                  : []),
                ...(context.args.includeExpiredTicket
                  ? [
                      createWalletStoryTicket({
                        id: '018f47a1-3d5b-7abc-8def-0123456789ac',
                        name: context.args.archivedTicketName,
                        status: context.args.archivedTicketStatus,
                      }),
                    ]
                  : []),
              ]),
              watchCurrentUser: () => EMPTY,
            },
          },
        ],
      })(story, context),
  ],
};

export default meta;

type Story = StoryObj<WalletStoryArgs>;

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await userEvent.tab();
  const buttons = canvas.queryAllByRole('button');
  const enabledButton = buttons.find(
    (button) => !button.hasAttribute('disabled') && button.getAttribute('aria-disabled') !== 'true',
  );
  if (enabledButton) {
    await userEvent.hover(enabledButton);
    await expect(enabledButton).toBeVisible();
  }
  const links = canvas.queryAllByRole('link');
  if (links[0]) {
    await expect(links[0]).toBeVisible();
  }
};

export const Playground: Story = {
  globals: { theme: 'light', network: 'online', serviceWorker: 'enabled' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OfflineInstalled: Story = {
  globals: { theme: 'light', network: 'offline', serviceWorker: 'enabled' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const NoServiceWorker: Story = {
  globals: { theme: 'dark', network: 'online', serviceWorker: 'disabled', motion: 'reduced' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const CardSelection: Story = {
  globals: { theme: 'light', network: 'online', serviceWorker: 'enabled' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /registro acadêmico/i }));
    await expect(await canvas.findByText(/Registro Acadêmico/i)).toBeVisible();
    await userEvent.click(await canvas.findByRole('button', { name: /voltar para a lista de cartões/i }));
    await expect(await canvas.findByText('CACiC Eventos')).toBeVisible();
  },
};

export const EventTicketStack: Story = {
  args: { includeEventTicket: true, includeExpiredTicket: true },
  globals: { theme: 'dark', network: 'online', serviceWorker: 'enabled' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const backgrounds = await Promise.all(['CACiC Eventos', 'Código off-line', 'Registro Acadêmico'].map(async (name) => {
      const header = await canvas.findByRole('button', { name });
      const surface = header.closest('mat-card');
      if (!surface) throw new Error(`Card surface missing for ${name}`);
      return getComputedStyle(surface).backgroundColor;
    }));
    await expect(new Set(backgrounds).size).toBe(3);
  },
};

export const EventTicket: Story = {
  args: { includeEventTicket: true, includeExpiredTicket: true },
  globals: { theme: 'dark', network: 'online', serviceWorker: 'enabled' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('button', { name: /festa de encerramento/i })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Ver 1 bilhetes expirados' })).toBeVisible();
    await userEvent.click(await canvas.findByRole('button', { name: /festa de encerramento/i }));
    await expect(await canvas.findByRole('link', { name: /mais informações sobre festa de encerramento/i })).toBeVisible();
  },
};

export const ExpiredTicket: Story = {
  args: { includeEventTicket: true, includeExpiredTicket: true, archivedTicketStatus: 'EXPIRED' },
  globals: { theme: 'light', network: 'online', serviceWorker: 'enabled' },
  play: async ({ canvasElement, args }) => showArchivedPass(canvasElement, 'Prazo de validade encerrado', args.archivedTicketName),
};

export const ConsumedTicket: Story = {
  args: { includeExpiredTicket: true, archivedTicketStatus: 'CONSUMED' },
  play: async ({ canvasElement, args }) => showArchivedPass(canvasElement, 'Bilhete já utilizado', args.archivedTicketName),
};

export const RevokedTicket: Story = {
  args: { includeExpiredTicket: true, archivedTicketStatus: 'REVOKED' },
  play: async ({ canvasElement, args }) => showArchivedPass(canvasElement, 'Bilhete revogado', args.archivedTicketName),
};

export const ParticipantOnly: Story = {
  args: { role: 'participant', enrollmentNumber: '' },
  globals: { theme: 'light', network: 'online', serviceWorker: 'enabled' },
};

export const OfflineSnapshot: Story = {
  args: { authenticated: false, networkOnline: false, offlineSnapshotAvailable: true },
  globals: { theme: 'dark', network: 'offline', serviceWorker: 'enabled', motion: 'reduced' },
};

export const NoIdentityAvailable: Story = {
  args: {
    authenticated: false,
    networkOnline: false,
    offlineSnapshotAvailable: false,
    enrollmentNumber: '',
    identityDocument: '',
  },
  globals: { theme: 'light', network: 'offline', serviceWorker: 'enabled' },
};

export const LongIdentityData: Story = {
  args: {
    fullName: 'Marina Aparecida de Souza e Silva Albuquerque dos Santos',
    enrollmentNumber: '202612345678901234',
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', network: 'online', serviceWorker: 'enabled', motion: 'reduced' },
};

async function showArchivedPass(
  canvasElement: HTMLElement,
  reason: string,
  name = 'Kit de boas-vindas',
): Promise<void> {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole('button', { name: 'Ver 1 bilhetes expirados' }));
  const row = await canvas.findByRole('button', { name: new RegExp(`^${escapeRegExp(name)}`) });
  await expect(row.querySelectorAll('[matListItemTitle], [matListItemLine]')).toHaveLength(2);
  await userEvent.click(row);
  await expect(await canvas.findByText('Expirado')).toBeVisible();
  await expect(canvas.getByText(reason)).toBeVisible();
  const barcode = canvasElement.querySelector('.expired-barcode .barcode-content');
  if (!barcode) throw new Error('Expired ticket barcode should remain rendered.');
  await expect(barcode).toHaveAttribute('aria-hidden', 'true');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
