import { provideRouter } from '@angular/router';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { WalletAddCard } from './add-card';

const meta: Meta<WalletAddCard> = {
  component: WalletAddCard,
  title: 'Public/Profile/Wallet/Add Card',
  tags: ['autodocs'],
  decorators: [applicationConfig({ providers: [provideRouter([])] })],
  parameters: { layout: 'fullscreen', a11y: { test: 'todo' } },
};

export default meta;

type Story = StoryObj<WalletAddCard>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('link', { name: /Cartão do R\.U\./i })).toBeVisible();
  },
};
