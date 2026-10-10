import { signal } from '@angular/core';
import { CacicAccountPrivacyService } from '@cacic-fct/account-manager-privacy';
import { AuthService } from '@cacic-fct/shared-angular/auth';
import { CookieBannerSyncService } from '@cacic-fct/shared-angular/privacy/cookie-banner-sync';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { of } from 'rxjs';
import { CookieBannerFeatureFlagService } from './feature-flags/cookie-banner-feature-flag.service';
import { App } from './app';

const cookieBannerEnabled = signal(true);

const meta: Meta<App> = {
  component: App,
  title: 'Admin/Layout/Application',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        { provide: CookieBannerFeatureFlagService, useValue: { enabled: cookieBannerEnabled } },
        { provide: AuthService, useValue: { isAuthenticated: () => false, user: () => null } },
        { provide: CookieBannerSyncService, useValue: { acceptCookieBanner: () => of(false) } },
        { provide: CacicAccountPrivacyService, useValue: { refresh: () => of(undefined) } },
      ],
    }),
  ],
  beforeEach: () => {
    cookieBannerEnabled.set(true);
    window.localStorage.removeItem('cacic.cookieBanner.accepted');
    document.cookie = 'cacic_cookie_banner_accepted=; Max-Age=0; path=/';
  },
  parameters: {
    docs: {
      description: {
        component: 'Root application view for checking navigation and startup behavior. Use the network global to inspect the offline shell.',
      },
    },
    layout: 'fullscreen',
    controls: { disable: true },
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<App>;

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const banner = await canvas.findByRole('banner', { name: 'Aviso sobre cookies' });
  await waitFor(() => expect(banner).toBeVisible(), { timeout: 1_500 });
  const privacyLink = await canvas.findByRole('link', { name: 'Política de Privacidade' });
  const acceptButton = await canvas.findByRole('button', { name: 'Aceitar cookies' });
  await waitFor(() => expect(acceptButton).toBeVisible(), { timeout: 1_500 });
  await expect(acceptButton).toBeEnabled();
  await expect(privacyLink).toBeVisible();
  await userEvent.tab();
  await expect(privacyLink).toHaveFocus();
  await userEvent.tab();
  await expect(acceptButton).toHaveFocus();
  await userEvent.hover(acceptButton);
};

export const Playground: Story = {
  args: {},
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OfflineWorkspaceShell: Story = {
  ...Playground,
  name: 'Offline admin shell',
  globals: { ...Playground.globals, network: 'offline' },
};
