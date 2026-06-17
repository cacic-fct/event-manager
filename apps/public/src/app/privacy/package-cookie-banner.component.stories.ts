import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { CookieBannerOptions } from '@cacic-fct/account-manager-cookie-banner';
import { fakerPT_BR as faker } from '@faker-js/faker';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PackageCookieBannerComponent],
  template: `<app-cookie-banner [config]="config()" />`,
})
class CookieBannerStoryHostComponent {
  readonly authenticated = input(true);
  readonly storageKey = input('storybook-cookie-banner');
  readonly text = input(
    'Usamos cookies para lembrar suas preferências e melhorar a experiência nos eventos do CACiC.',
  );
  readonly buttonText = input('Entendi');
  readonly privacyPolicyUrl = input('https://cacic.dev.br/legal/privacy-policy');

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
  title: 'Public/Privacy/Package Cookie Banner',
  tags: ['autodocs'],
  args: {
    authenticated: true,
    storageKey: 'storybook-cookie-banner-default',
    text: defaultText,
    buttonText: 'Aceitar cookies',
    privacyPolicyUrl: 'https://cacic.dev.br/legal/privacy-policy',
  },
  argTypes: {
    authenticated: { control: 'boolean' },
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

async function exerciseStory(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement);
  await expect(await canvas.findByRole('button', { name: /aceitar|entendi/i })).toBeVisible();
  await userEvent.tab();
}

export const Playground: Story = {
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const GuestUser: Story = {
  args: {
    authenticated: false,
    storageKey: 'storybook-cookie-banner-guest',
    buttonText: 'Continuar',
  },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};
