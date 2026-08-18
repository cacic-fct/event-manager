import { provideRouter } from '@angular/router';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { WalletAddCard } from './add-card';
import { RestaurantCardEnrollment } from '../restaurant-card-enrollment/restaurant-card-enrollment';

const meta: Meta<WalletAddCard> = {
  component: WalletAddCard,
  title: 'CACiC Eventos/Profile/Wallet/Add Card',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({ providers: [provideRouter([{ path: 'restaurant', component: RestaurantCardEnrollment }])] }),
  ],
  parameters: { layout: 'fullscreen', a11y: { test: 'todo' } },
};

export default meta;

type Story = StoryObj<WalletAddCard>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const restaurantLink = await canvas.findByRole('link', { name: /Cartão do R\.U\./i });
    await expect(restaurantLink).toBeVisible();
    await userEvent.click(restaurantLink);
    await expect(window.location.pathname).toBe('/restaurant');
  },
};

export const DarkReducedMotion: Story = {
  ...Playground,
  globals: { ...Playground.globals, theme: 'dark', motion: 'reduced' },
  parameters: { viewport: { defaultViewport: 'mobile' } },
};

export const KeyboardNavigation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.tab();
    await userEvent.tab();
    await expect(await canvas.findByRole('link', { name: /Cartão do R\.U\./i })).toHaveFocus();
  },
};
