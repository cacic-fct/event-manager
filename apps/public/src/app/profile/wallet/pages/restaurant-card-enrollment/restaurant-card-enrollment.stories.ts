import { provideRouter } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, fn, userEvent, within } from 'storybook/test';
import { RestaurantCardService } from '../../services/restaurant-card.service';
import { walletStoryUser } from '../../testing/wallet-story-fixtures';
import { RestaurantCardEnrollment } from './restaurant-card-enrollment';

const saveRestaurantCard = fn();

const meta: Meta<RestaurantCardEnrollment> = {
  component: RestaurantCardEnrollment,
  title: 'Public/Profile/Wallet/Restaurant Card Enrollment',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user: () => ({ sub: walletStoryUser.userId }) } },
        { provide: RestaurantCardService, useValue: { get: () => null, load: () => Promise.resolve(), save: saveRestaurantCard } },
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
    const cardNumber = await canvas.findByRole('textbox', { name: /Número do Cartão de Cliente/i });
    const saveButton = canvas.getByRole('button', { name: /Adicionar cartão/i });
    await expect(saveButton).toBeDisabled();
    await userEvent.type(cardNumber, '12ab34');
    await expect(saveButton).toBeEnabled();
    await userEvent.click(saveButton);
    await expect(saveRestaurantCard).toHaveBeenCalledWith(walletStoryUser.userId, '1234');
  },
};
