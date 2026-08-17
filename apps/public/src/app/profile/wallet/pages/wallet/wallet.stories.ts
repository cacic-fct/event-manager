import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { AuthService } from '@cacic-fct/shared-angular';
import { TotpSeedSessionService } from '../../../../shared/totp/totp-seed-session.service';
import { RestaurantCardService } from '../../services/restaurant-card.service';
import { createWalletStoryTotpSession, createWalletStoryUser } from '../../testing/wallet-story-fixtures';
import { Wallet } from './wallet';
import { NetworkStatusService } from '../../../../shared/network-status.service';
import { OfflineUserDataService } from '../../../../shared/offline-user-data.service';

type WalletStoryArgs = {
  fullName: string;
  role: 'aluno-graduacao' | 'participant';
  enrollmentNumber: string;
  restaurantClientNumber: string;
  identityDocument: string;
  picture: string;
  authenticated: boolean;
  networkOnline: boolean;
  offlineSnapshotAvailable: boolean;
  restaurantCardAvailable: boolean;
};

const defaultArgs: WalletStoryArgs = {
  fullName: 'Marina da Silva',
  role: 'aluno-graduacao',
  enrollmentNumber: '00123456',
  restaurantClientNumber: '000123456',
  identityDocument: '52998224725',
  picture: '',
  authenticated: true,
  networkOnline: true,
  offlineSnapshotAvailable: true,
  restaurantCardAvailable: true,
};

const meta: Meta<WalletStoryArgs> = {
  component: Wallet,
  title: 'CACiC Eventos/Profile/Wallet/Page',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
  args: defaultArgs,
  argTypes: {
    fullName: { control: 'text' },
    role: { control: 'select', options: ['aluno-graduacao', 'participant'] },
    enrollmentNumber: { control: 'text' },
    restaurantClientNumber: { control: 'text' },
    identityDocument: { control: 'text' },
    picture: { control: 'text' },
    authenticated: { control: 'boolean' },
    networkOnline: { control: 'boolean' },
    offlineSnapshotAvailable: { control: 'boolean' },
    restaurantCardAvailable: { control: 'boolean' },
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
            provide: RestaurantCardService,
            useValue: {
              load: () => undefined,
              get: () =>
                context.args.restaurantCardAvailable
                  ? context.args.restaurantClientNumber.replace(/\D/g, '') || null
                  : null,
            },
          },
          {
            provide: TotpSeedSessionService,
            useValue: {
              ...createWalletStoryTotpSession(),
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
    await userEvent.click(await canvas.findByRole('button', { name: /r\.a\. - registro acadêmico/i }));
    await expect(await canvas.findByText('Registro acadêmico')).toBeVisible();
    await userEvent.click(await canvas.findByRole('button', { name: /voltar para a lista de cartões/i }));
    await expect(await canvas.findByText('CACiC Eventos')).toBeVisible();
  },
};

export const ParticipantOnly: Story = {
  args: { role: 'participant', enrollmentNumber: '', restaurantCardAvailable: false },
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
    restaurantCardAvailable: false,
  },
  globals: { theme: 'light', network: 'offline', serviceWorker: 'enabled' },
};

export const LongIdentityData: Story = {
  args: {
    fullName: 'Marina Aparecida de Souza e Silva Albuquerque dos Santos',
    enrollmentNumber: '202612345678901234',
    restaurantClientNumber: '000123456789012345',
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', network: 'online', serviceWorker: 'enabled', motion: 'reduced' },
};
