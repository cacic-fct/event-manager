import { provideRouter } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { RestaurantCardService } from '../../services/restaurant-card.service';
import { walletStoryUser } from '../../testing/wallet-story-fixtures';
import { RestaurantCardEnrollment } from './restaurant-card-enrollment';

const meta: Meta<RestaurantCardEnrollment> = {
  component: RestaurantCardEnrollment,
  title: 'Public/Profile/Wallet/Restaurant Card Enrollment',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user: () => ({ sub: walletStoryUser.userId }) } },
        { provide: RestaurantCardService, useValue: { save: () => undefined } },
      ],
    }),
  ],
  parameters: { layout: 'fullscreen', a11y: { test: 'todo' } },
};

export default meta;

type Story = StoryObj<RestaurantCardEnrollment>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('textbox', { name: /Número do Cartão de Cliente/i })).toBeVisible();
    await expect(canvas.getByRole('button', { name: /Adicionar cartão/i })).toBeDisabled();
  },
};
