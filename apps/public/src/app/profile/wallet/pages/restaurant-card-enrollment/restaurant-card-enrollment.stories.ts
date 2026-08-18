import { provideRouter } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, fn, screen, userEvent, within } from 'storybook/test';
import { RestaurantCardService } from '../../services/restaurant-card.service';
import { walletStoryUser } from '../../testing/wallet-story-fixtures';
import { RestaurantCardEnrollment } from './restaurant-card-enrollment';

const saveRestaurantCard = fn();
let existingCardNumber: string | null = null;
let saveOutcome: 'success' | 'error' = 'success';

interface RestaurantCardEnrollmentStoryArgs {
  existingCardNumber: string | null;
  saveOutcome: 'success' | 'error';
}

const meta: Meta<RestaurantCardEnrollmentStoryArgs> = {
  component: RestaurantCardEnrollment,
  title: 'CACiC Eventos/Profile/Wallet/Restaurant Card Enrollment',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user: () => ({ sub: walletStoryUser.userId }) } },
        {
          provide: RestaurantCardService,
          useValue: {
            get: () => existingCardNumber,
            load: () => Promise.resolve(),
            save: async (userId: string, cardNumber: string) => {
              saveRestaurantCard(userId, cardNumber);
              if (saveOutcome === 'error') {
                throw new Error('Falha simulada ao salvar.');
              }
            },
          },
        },
      ],
    }),
  ],
  args: { existingCardNumber: null, saveOutcome: 'success' },
  argTypes: {
    existingCardNumber: { control: 'text', description: 'Número já salvo; vazio representa um novo cartão.' },
    saveOutcome: { control: 'inline-radio', options: ['success', 'error'] },
  },
  render: (args) => {
    existingCardNumber = args.existingCardNumber?.trim() || null;
    saveOutcome = args.saveOutcome;
    return { props: {} };
  },
  parameters: { layout: 'fullscreen', a11y: { test: 'todo' } },
};

export default meta;

type Story = StoryObj<RestaurantCardEnrollmentStoryArgs>;

export const Playground: Story = {
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

export const ExistingCard: Story = {
  args: { existingCardNumber: '987654321' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByDisplayValue('987654321')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Salvar alterações' })).toBeEnabled();
  },
};

export const SaveErrorDarkReducedMotion: Story = {
  args: { saveOutcome: 'error' },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(await canvas.findByRole('textbox', { name: /Número do Cartão de Cliente/i }), '1234');
    await userEvent.click(canvas.getByRole('button', { name: 'Adicionar cartão' }));
    await expect(await screen.findByText('Não foi possível salvar o cartão. Tente novamente.')).toBeVisible();
  },
};
