import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { signal } from '@angular/core';
import { AuthService } from '@cacic-fct/shared-angular';
import { withScenarioControls } from '@cacic-fct/shared-angular/storybook';
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
  title: 'Public/Landing/Home Redirect',
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
    withScenarioControls<HomeStoryArgs>(),
  ],
  args: { authenticated: false },
  argTypes: {
    authenticated: {
      control: 'boolean',
      description: 'Choose whether the home route shows the landing page or starts an authenticated redirect.',
    },
  },
  render: (args) => {
    authenticated.set(args.authenticated);
    return { props: {} };
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
    docs: {
      description: {
        component:
          'The authentication control reloads this constructor-driven route so the landing and redirect flows stay in sync with the selected scenario.',
      },
    },
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

export const OfflineGuest: Story = {
  args: { authenticated: false },
  globals: { network: 'offline' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('heading', { name: 'CACiC Eventos' })).toBeVisible();
  },
};
