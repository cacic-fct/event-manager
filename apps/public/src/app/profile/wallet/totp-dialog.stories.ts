import { MatDialogRef } from '@angular/material/dialog';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { TotpSeedSessionService } from '../../shared/totp/totp-seed-session.service';
import { WalletTotpDialog } from './totp-dialog';

type TotpDialogStoryState = 'ready' | 'empty' | 'loading' | 'error';

interface TotpDialogStoryArgs {
  state: TotpDialogStoryState;
  primaryEmail: string;
}

const defaultArgs: TotpDialogStoryArgs = {
  state: 'ready',
  primaryEmail: 'story.user@unesp.br',
};

let activeArgs = defaultArgs;

const totpSessionMock: Pick<TotpSeedSessionService, 'getWalletSeed'> = {
  getWalletSeed: () => {
    if (activeArgs.state === 'loading') {
      return new Promise(() => undefined);
    }

    if (activeArgs.state === 'error') {
      return Promise.reject(new Error('seed relay failed'));
    }

    if (activeArgs.state === 'empty') {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      userId: 'storybook-user',
      primaryEmail: activeArgs.primaryEmail,
      seed: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
      algorithm: 'SHA512',
      digits: 6,
      periodSeconds: 30,
      serverTime: new Date('2026-06-26T16:00:00.000Z').toISOString(),
      sessionExpiresAt: Date.now() + 60 * 60 * 1000,
      updatedAt: Date.now(),
    });
  },
};

const meta: Meta<TotpDialogStoryArgs> = {
  component: WalletTotpDialog,
  title: 'Public/Profile/Wallet/TOTP Dialog',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        { provide: TotpSeedSessionService, useValue: totpSessionMock },
        { provide: MatDialogRef, useValue: { close: () => undefined } },
      ],
    }),
  ],
  args: defaultArgs,
  argTypes: {
    state: {
      control: 'select',
      options: ['ready', 'empty', 'loading', 'error'],
    },
    primaryEmail: { control: 'text' },
  },
  render: (args) => {
    activeArgs = args;
    return { props: {} };
  },
};

export default meta;

type Story = StoryObj<TotpDialogStoryArgs>;

export const Ready: Story = {
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Código off-line')).toBeVisible();
    await expect(await canvas.findByText('story.user@unesp.br')).toBeVisible();
  },
};

export const EmptyCache: Story = {
  args: { state: 'empty' },
  globals: { theme: 'light', network: 'offline' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Código indisponível')).toBeVisible();
  },
};

export const Loading: Story = {
  args: { state: 'loading' },
  globals: { theme: 'light', network: 'online' },
};

export const RelayError: Story = {
  args: { state: 'error' },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Código indisponível')).toBeVisible();
  },
};
