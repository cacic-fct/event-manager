import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { signal } from '@angular/core';
import { AuthService } from '@cacic-fct/shared-angular';
import { expect, fn, within } from 'storybook/test';
import { HomeComponent } from './home-redirect.page';
import { DefaultRedirectService } from './default-redirect.service';

interface HomeStoryArgs {
  authenticated: boolean;
}

const authenticated = signal(false);
const navigateToDefault = fn(async () => undefined);
const navigateOfflineReturningUser = fn(async () => undefined);

const meta: Meta<HomeStoryArgs> = {
  component: HomeComponent,
  title: 'CACiC Eventos/Landing/Home Redirect',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        { provide: AuthService, useValue: { isAuthenticated: authenticated, login: async () => undefined } },
        {
          provide: DefaultRedirectService,
          useValue: { navigateToDefault, navigateOfflineReturningUser },
        },
      ],
    }),
  ],
  args: { authenticated: false },
  argTypes: {
    authenticated: {
      control: 'boolean',
      description: 'Define se a rota inicial deve exibir a landing ou redirecionar.',
    },
  },
  render: (args) => {
    authenticated.set(args.authenticated);
    return { props: {} };
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<HomeStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('heading', { name: 'CACiC Eventos' })).toBeVisible();
    await expect(navigateOfflineReturningUser).toHaveBeenCalled();
  },
};

export const AuthenticatedRedirect: Story = {
  args: { authenticated: true },
  play: async () => {
    await expect(navigateToDefault).toHaveBeenCalled();
  },
};

export const OfflineGuestDarkReducedMotion: Story = {
  args: { authenticated: false },
  globals: { theme: 'dark', network: 'offline', motion: 'reduced' },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('heading', { name: 'CACiC Eventos' })).toBeVisible();
  },
};
