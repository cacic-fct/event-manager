import { provideRouter } from '@angular/router';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { WalletAddCard } from './add-card';

const meta: Meta<WalletAddCard> = {
  component: WalletAddCard,
  title: 'Public/Profile/Wallet/Add Card',
  tags: ['autodocs'],
  decorators: [applicationConfig({ providers: [provideRouter([{ path: 'restaurant', component: WalletAddCard }])] })],
  parameters: { layout: 'fullscreen', a11y: { test: 'todo' } },
};

export default meta;

type Story = StoryObj<WalletAddCard>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const restaurantLink = await canvas.findByRole('link', { name: /Cartão do R\.U\./i });
    await expect(restaurantLink).toBeVisible();
    await userEvent.click(restaurantLink);
    await expect(window.location.pathname).toBe('/restaurant');
  },
};
