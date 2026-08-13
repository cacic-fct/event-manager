import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { AuthService } from '@cacic-fct/shared-angular';
import { TotpSeedSessionService } from '../../../../shared/totp/totp-seed-session.service';
import { RestaurantCardService } from '../../services/restaurant-card.service';
import { createWalletStoryTotpSession, createWalletStoryUser } from '../../testing/wallet-story-fixtures';
import { Wallet } from './wallet';

type WalletStoryArgs = {
  fullName: string;
  role: 'aluno-graduacao' | 'participant';
  enrollmentNumber: string;
  restaurantClientNumber: string;
};

const defaultArgs: WalletStoryArgs = {
  fullName: 'Marina da Silva',
  role: 'aluno-graduacao',
  enrollmentNumber: '00123456',
  restaurantClientNumber: '000123456',
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
  },
  decorators: [
    (story, context) =>
      applicationConfig({
        providers: [
          {
            provide: AuthService,
            useValue: {
              user: () => ({
                sub: createWalletStoryUser().userId,
                claims: {
                  name: context.args.fullName,
                  enrollment_number: context.args.enrollmentNumber,
                  unesp_role: context.args.role,
                  identity_document: '52998224725',
                },
              }),
              isAuthenticated: () => true,
            },
          },
          {
            provide: RestaurantCardService,
            useValue: {
              load: () => undefined,
              get: () => context.args.restaurantClientNumber.replace(/\D/g, '') || null,
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
