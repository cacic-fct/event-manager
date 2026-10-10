import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AuthService, ServiceWorkerService } from '@cacic-fct/shared-angular';
import { applicationConfig } from '@storybook/angular';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { Preferences } from './preferences';

const authState = signal(false);
const serviceWorkerAvailable = signal(true);

interface PreferencesStoryArgs {
  authenticated: boolean;
  serviceWorkerAvailable: boolean;
}

const meta: Meta<PreferencesStoryArgs> = {
  component: Preferences,
  title: 'Public/Settings/Preferences',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
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
            hasServiceWorker: serviceWorkerAvailable,
          },
        },
      ],
    }),
  ],
  args: { authenticated: false, serviceWorkerAvailable: true },
  argTypes: {
    authenticated: {
      control: 'boolean',
      name: 'Authenticated',
      description: 'Shows the actions available to a signed-in participant.',
    },
    serviceWorkerAvailable: {
      control: 'boolean',
      name: 'Service Worker Available',
      description: 'Selects whether offline app support is available.',
    },
  },
  render: (args) => {
    authState.set(args.authenticated);
    serviceWorkerAvailable.set(args.serviceWorkerAvailable);
    return { props: {} };
  },
};

export default meta;

type Story = StoryObj<PreferencesStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Preferências')).toBeVisible();
    await expect(await canvas.findByText('Aplicativo')).toBeVisible();
    await userEvent.hover(await canvas.findByRole('link', { name: /calendário/i }));
    await userEvent.hover(await canvas.findByRole('link', { name: /service worker/i }));
  },
};

export const LoggedIn: Story = {
  args: { authenticated: true },
  globals: { network: 'online', serviceWorker: 'enabled' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Conta')).toBeVisible();
    await expect(await canvas.findByRole('link', { name: /editar informações da conta/i })).toBeVisible();
    await expect(await canvas.findByRole('button', { name: /sair da conta/i })).toBeVisible();
  },
};

export const OfflineWithoutServiceWorker: Story = {
  args: { authenticated: false, serviceWorkerAvailable: false },
  globals: { network: 'offline', serviceWorker: 'disabled' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Indisponível')).toBeVisible();
    await expect(canvas.queryByText('Conta')).not.toBeInTheDocument();
  },
};
