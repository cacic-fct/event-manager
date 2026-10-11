import { Component, computed, input } from '@angular/core';
import type { CookieBannerOptions } from '@cacic-fct/account-manager-cookie-banner/angular';
import { fakerPT_BR as faker } from '@faker-js/faker';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { PackageCookieBannerComponent } from './package-cookie-banner.component';

faker.seed(20260616);

type CookieBannerStoryArgs = {
  authenticated: boolean;
  storageKey: string;
  text: string;
  buttonText: string;
  privacyPolicyUrl: string;
};

@Component({
  selector: 'app-storybook-cookie-banner-host',
  imports: [PackageCookieBannerComponent],
  template: `<app-cookie-banner [config]="config()" />`,
})
class CookieBannerStoryHostComponent {
  readonly authenticated = input(true);
  readonly storageKey = input('storybook-cookie-banner');
  readonly text = input('Usamos cookies para lembrar suas preferências e melhorar a experiência nos eventos do CACiC.');
  readonly buttonText = input('Entendi');
  readonly privacyPolicyUrl = input('https://cacic.com.br/legal/privacy-policy');

  readonly config = computed<CookieBannerOptions>(() => ({
    storageKey: this.storageKey(),
    text: this.text(),
    buttonText: this.buttonText(),
    privacyPolicyUrl: this.privacyPolicyUrl(),
    ariaLabel: 'Aviso de cookies',
    isAuthenticated: () => this.authenticated(),
    shouldShow: () => true,
  }));
}

const defaultText = `Usamos cookies para ${faker.helpers.arrayElement([
  'lembrar suas preferências',
  'manter sua sessão segura',
  'melhorar sua experiência no evento',
])} e respeitamos sua privacidade.`;

const meta: Meta<CookieBannerStoryArgs> = {
  component: CookieBannerStoryHostComponent,
  title: 'Public/Layout/Cookie Banner',
  tags: ['autodocs'],
  args: {
    authenticated: true,
    storageKey: 'storybook-cookie-banner-default',
    text: defaultText,
    buttonText: 'Aceitar cookies',
    privacyPolicyUrl: 'https://cacic.com.br/legal/privacy-policy',
  },
  argTypes: {
    authenticated: { control: 'boolean' },
    storageKey: { control: 'text' },
    text: { control: 'text' },
    buttonText: { control: 'text' },
    privacyPolicyUrl: { control: 'text' },
  },
  beforeEach: ({ args }) => {
    try {
      window.localStorage.removeItem(args.storageKey);
    } catch {
      return;
    }
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<CookieBannerStoryArgs>;

async function exerciseStory(canvasElement: HTMLElement, args: CookieBannerStoryArgs): Promise<void> {
  const canvas = within(canvasElement);
  const acceptButton = await canvas.findByRole('button', { name: /aceitar cookies/i });
  await waitFor(() => expect(acceptButton).toBeVisible());
  await expect(acceptButton).toHaveTextContent(args.buttonText);
  await userEvent.tab();
}

export const Playground: Story = {
  play: async ({ args, canvasElement }) => exerciseStory(canvasElement, args),
};

export const GuestUser: Story = {
  args: {
    authenticated: false,
    storageKey: 'storybook-cookie-banner-guest',
    buttonText: 'Continuar',
  },
  play: async ({ args, canvasElement }) => exerciseStory(canvasElement, args),
};

export const LongCopy: Story = {
  args: {
    authenticated: true,
    storageKey: 'storybook-cookie-banner-long-copy',
    text: 'Usamos cookies essenciais para manter sua sessão segura, sincronizar preferências entre dispositivos compartilhados durante os eventos e respeitar as escolhas de privacidade registradas na sua conta.',
    buttonText: 'Entendi e desejo continuar',
  },
  play: async ({ args, canvasElement }) => exerciseStory(canvasElement, args),
};
