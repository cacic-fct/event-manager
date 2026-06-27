import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AuthService, ServiceWorkerService } from '@cacic-fct/shared-angular';
import { applicationConfig } from '@storybook/angular';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { Preferences } from './preferences';

const authState = signal(false);

const meta: Meta<Preferences> = {
  component: Preferences,
  title: 'Public/Preferences/Preferences',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: authState,
            logout: async () => undefined,
          },
        },
        {
          provide: ServiceWorkerService,
          useValue: {
            hasServiceWorker: () => true,
          },
        },
      ],
    }),
  ],
};

export default meta;

type Story = StoryObj<Preferences>;

export const Default: Story = {
  beforeEach: () => {
    authState.set(false);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Preferências')).toBeVisible();
    await expect(await canvas.findByText('Aplicativo')).toBeVisible();
    await userEvent.hover(await canvas.findByRole('link', { name: /calendário/i }));
    await userEvent.hover(await canvas.findByRole('link', { name: /service worker/i }));
  },
};

export const LoggedIn: Story = {
  beforeEach: () => {
    authState.set(true);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Conta')).toBeVisible();
    await expect(await canvas.findByRole('link', { name: /editar informações da conta/i })).toBeVisible();
    await expect(await canvas.findByRole('button', { name: /sair da conta/i })).toBeVisible();
  },
};
