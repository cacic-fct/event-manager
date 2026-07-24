import { provideRouter } from '@angular/router';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { AuthErrorPage } from './auth-error-page';

const meta: Meta<AuthErrorPage> = {
  component: AuthErrorPage,
  title: 'Public/Auth/Error Page',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [provideRouter([])],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<AuthErrorPage>;

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByRole('heading', { name: /tempo de login expirou/i })).toBeVisible();
  await expect(canvas.getByRole('button', { name: /entrar com o google/i })).toBeVisible();
  await userEvent.click(canvas.getByText('Detalhes técnicos'));
  await expect(canvas.getByText(/Invalid authorization state/i)).toBeVisible();
  await userEvent.hover(canvas.getByRole('button', { name: /copiar detalhes técnicos/i }));
};

export const LoginExpired: Story = {
  args: {},
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const LongTechnicalDetails: Story = {
  args: {
    contentOverride: {
      title: 'O tempo de login expirou.',
      description: 'Entre novamente para continuar.',
      actionLabel: 'Entrar com o Google',
      returnTo: '/calendar',
      rawError: JSON.stringify(
        {
          message: 'Invalid authorization state.',
          error: 'Bad Request',
          statusCode: 400,
          details:
            'The authorization state cookie was missing or no longer matched the state returned by the identity provider.',
          requestId: 'auth-storybook-very-long-request-id-018f47b15c4e7c7b9e6f0c8c2f7281ad',
        },
        null,
        2,
      ),
    },
  },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const DarkTheme: Story = {
  args: {},
  globals: { theme: 'dark', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};
