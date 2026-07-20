import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { CookieBannerOptions } from '@cacic-fct/account-manager-cookie-banner/angular';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { PackageCookieBannerComponent } from './package-cookie-banner.component';

type CookieBannerStoryArgs = {
  authenticated: boolean;
  forceVisible: boolean;
  storageKey: string;
  text: string;
  buttonText: string;
  privacyPolicyUrl: string;
};

@Component({
  selector: 'app-storybook-admin-cookie-banner-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PackageCookieBannerComponent],
  template: `<app-cookie-banner [config]="config()" />`,
})
class AdminCookieBannerStoryHostComponent {
  readonly authenticated = input(true);
  readonly forceVisible = input(true);
  readonly storageKey = input('storybook-admin-cookie-banner');
  readonly text = input('Usamos cookies para manter sua sessão administrativa segura e lembrar suas preferências.');
  readonly buttonText = input('Entendi');
  readonly privacyPolicyUrl = input('/legal/privacy-policy');

  readonly config = computed<CookieBannerOptions>(() => ({
    storageKey: this.storageKey(),
    text: this.text(),
    buttonText: this.buttonText(),
    privacyPolicyUrl: this.privacyPolicyUrl(),
    ariaLabel: 'Aviso de cookies',
    isAuthenticated: () => this.authenticated(),
    shouldShow: () => this.forceVisible(),
  }));
}

const meta: Meta<CookieBannerStoryArgs> = {
  component: AdminCookieBannerStoryHostComponent,
  title: 'CACiC Eventos/Privacy/Package Cookie Banner',
  tags: ['autodocs'],
  args: {
    authenticated: true,
    forceVisible: true,
    storageKey: 'storybook-admin-cookie-banner-default',
    text: 'Usamos cookies para manter sua sessão administrativa segura e lembrar suas preferências.',
    buttonText: 'Entendi',
    privacyPolicyUrl: '/legal/privacy-policy',
  },
  argTypes: {
    authenticated: { control: 'boolean' },
    forceVisible: { control: 'boolean' },
    storageKey: { control: 'text' },
    text: { control: 'text' },
    buttonText: { control: 'text' },
    privacyPolicyUrl: { control: 'text' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<CookieBannerStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('button', { name: /entendi/i })).toBeVisible();
  },
};

export const GuestUser: Story = {
  args: {
    authenticated: false,
    storageKey: 'storybook-admin-cookie-banner-guest',
    text: 'Este aviso também aparece antes da autenticação quando a política de cookies exigir consentimento.',
  },
};
