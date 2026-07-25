import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { TotpSeedSessionService } from '../../../../shared/totp/totp-seed-session.service';
import { createWalletStoryTotpSession } from '../../testing/wallet-story-fixtures';
import { WalletOfflineCodeCard } from './offline-code-card';

type OfflineCodeCardStoryArgs = { state: 'ready' | 'unavailable' | 'loading' };

let state: OfflineCodeCardStoryArgs['state'] = 'ready';

const meta: Meta<OfflineCodeCardStoryArgs> = {
  component: WalletOfflineCodeCard,
  title: 'Public/Profile/Wallet/Offline Code Card',
  tags: ['autodocs'],
  args: { state: 'ready' },
  argTypes: { state: { control: 'select', options: ['ready', 'unavailable', 'loading'] } },
  decorators: [
    (story, context) =>
      applicationConfig({
        providers: [
          {
            provide: TotpSeedSessionService,
            useValue: {
              getWalletSeed: () => {
                state = context.args.state;
                if (state === 'loading') return new Promise(() => undefined);
                if (state === 'unavailable') return Promise.resolve(null);
                return createWalletStoryTotpSession().getWalletSeed();
              },
            },
          },
        ],
      })(story, context),
  ],
  parameters: { layout: 'centered', a11y: { test: 'todo' } },
};

export default meta;

type Story = StoryObj<OfflineCodeCardStoryArgs>;

export const Ready: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('button', { name: /copiar código/i })).toBeVisible();
  },
};

export const Unavailable: Story = {
  args: { state: 'unavailable' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/Abra esta tela com internet/i)).toBeVisible();
  },
};

export const Loading: Story = { args: { state: 'loading' } };
