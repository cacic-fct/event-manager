import { provideRouter } from '@angular/router';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { AuthErrorPage, type AuthErrorPageContent } from './auth-error-page';

interface AuthErrorStoryArgs {
  title: string;
  description: string;
  actionLabel: string;
  returnTo: string;
  rawError: string;
}

const defaultArgs: AuthErrorStoryArgs = {
  title: 'O tempo de login expirou.',
  description: 'Entre novamente para continuar.',
  actionLabel: 'Entrar com o Google',
  returnTo: '/calendar',
  rawError: JSON.stringify({ message: 'Invalid authorization state.', error: 'Bad Request', statusCode: 400 }, null, 2),
};

const meta: Meta<AuthErrorStoryArgs> = {
  component: AuthErrorPage,
  title: 'CACiC Eventos/Auth/Error Page',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    title: { control: 'text' },
    description: { control: 'text' },
    actionLabel: { control: 'text' },
    returnTo: { control: 'text' },
    rawError: { control: 'text' },
  },
  render: (args) => ({
    props: {
      contentOverride: { ...args } satisfies AuthErrorPageContent,
    },
  }),
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

type Story = StoryObj<AuthErrorStoryArgs>;

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByRole('heading', { name: /tempo de login expirou/i })).toBeVisible();
  await expect(canvas.getByRole('button', { name: /entrar com o google/i })).toBeVisible();
  await userEvent.click(canvas.getByText('Detalhes técnicos'));
  await expect(canvas.getByText(/Invalid authorization state/i)).toBeVisible();
  await userEvent.hover(canvas.getByRole('button', { name: /copiar detalhes técnicos/i }));
};

export const Playground: Story = {
  args: {},
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const LongTechnicalDetails: Story = {
  args: {
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
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const ServerError: Story = {
  args: {
    title: 'Ocorreu um erro.',
    description: 'Tente novamente mais tarde.',
    rawError: JSON.stringify({ message: 'Internal server error', statusCode: 500, requestId: 'auth-storybook-500' }, null, 2),
  },
  globals: { theme: 'dark', network: 'online', motion: 'reduced' },
};

export const LongContentMobile: Story = {
  args: {
    title: 'Não foi possível concluir a autenticação institucional neste momento.',
    description: 'Entre novamente para continuar para a página que você estava acessando antes do redirecionamento.',
    actionLabel: 'Tentar entrar novamente com a conta Google institucional',
    returnTo: '/major-events/storybook/registration',
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'light', network: 'online', motion: 'reduced' },
};

export const DarkTheme: Story = {
  args: {},
  globals: { theme: 'dark', network: 'online', motion: 'reduced' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};
