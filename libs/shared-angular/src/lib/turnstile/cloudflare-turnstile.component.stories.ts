import { Component, effect, inject, input, signal } from '@angular/core';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { CloudflareTurnstileComponent } from './cloudflare-turnstile.component';
import { provideCloudflareTurnstile } from './cloudflare-turnstile.config';
import { CloudflareTurnstileService, TurnstileApi, TurnstileRenderOptions } from './cloudflare-turnstile.service';
import { withScenarioControls } from '../storybook/scenario-controls.decorator';

type TurnstileStoryStatus = 'ready' | 'error';

type CloudflareTurnstileStoryArgs = {
  status: TurnstileStoryStatus;
  action: string;
  theme: 'auto' | 'light' | 'dark';
};

class MockCloudflareTurnstileService {
  readonly status = signal<TurnstileStoryStatus>('ready');

  async load(): Promise<TurnstileApi> {
    if (this.status() === 'error') {
      throw new Error('Falha simulada ao carregar o Turnstile.');
    }

    return {
      render: (container: HTMLElement | string, options: TurnstileRenderOptions) => {
        const element = typeof container === 'string' ? document.querySelector<HTMLElement>(container) : container;
        if (!element) {
          return undefined;
        }
        element.innerHTML = '<button type="button">Verificação anti-spam simulada</button>';
        queueMicrotask(() => options.callback?.('storybook-turnstile-token'));
        return 'storybook-widget';
      },
      reset: () => undefined,
      remove: () => undefined,
    };
  }
}

@Component({
  selector: 'lib-storybook-cloudflare-turnstile-host',
  imports: [CloudflareTurnstileComponent],
  providers: [
    MockCloudflareTurnstileService,
    { provide: CloudflareTurnstileService, useExisting: MockCloudflareTurnstileService },
  ],
  template: `
    <lib-cloudflare-turnstile [action]="action()" [theme]="theme()" (tokenChange)="token.set($event)" />
    @if (token(); as currentToken) {
      <p>Token emitido: {{ currentToken }}</p>
    }
  `,
})
class CloudflareTurnstileStoryHostComponent {
  private readonly service = inject(MockCloudflareTurnstileService);

  readonly status = input<TurnstileStoryStatus>('ready');
  readonly action = input('subscription-submit');
  readonly theme = input<'auto' | 'light' | 'dark'>('auto');
  readonly token = signal<string | null>(null);

  constructor() {
    effect(() => this.service.status.set(this.status()));
  }
}

const meta: Meta<CloudflareTurnstileStoryArgs> = {
  component: CloudflareTurnstileStoryHostComponent,
  title: 'Shared/Verification/Cloudflare Turnstile',
  tags: ['autodocs'],
  args: {
    status: 'ready',
    action: 'subscription-submit',
    theme: 'auto',
  },
  argTypes: {
    status: {
      control: { type: 'select', labels: { ready: 'Ready', error: 'Load error' } },
      options: ['ready', 'error'],
      description: 'Simulated load result returned by the anti-spam provider.',
    },
    action: { control: 'text', description: 'Action sent to Turnstile for challenge classification.' },
    theme: {
      control: { type: 'select', labels: { auto: 'Automatic', light: 'Light', dark: 'Dark' } },
      options: ['auto', 'light', 'dark'],
    },
  },
  decorators: [
    applicationConfig({
      providers: [provideCloudflareTurnstile({ siteKey: '1x00000000000000000000AA' })],
    }),
    withScenarioControls<CloudflareTurnstileStoryArgs>(),
  ],
  parameters: {
    layout: 'centered',
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<CloudflareTurnstileStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('button', { name: /verificação anti-spam/i })).toBeVisible();
    await expect(await canvas.findByText('Token emitido: storybook-turnstile-token')).toBeVisible();
  },
};

export const LoadingError: Story = {
  args: {
    status: 'error',
  },
};

export const AuthenticationAction: Story = {
  args: {
    action: 'account-link',
    theme: 'light',
  },
};
