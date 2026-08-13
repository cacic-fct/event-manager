import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { CloudflareTurnstileComponent } from './cloudflare-turnstile.component';
import { provideCloudflareTurnstile } from './cloudflare-turnstile.config';
import { CloudflareTurnstileService, TurnstileApi, TurnstileRenderOptions } from './cloudflare-turnstile.service';

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
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  title: 'CACiC Eventos/Shared/Verification/Cloudflare Turnstile',
  tags: ['autodocs'],
  args: {
    status: 'ready',
    action: 'subscription-submit',
    theme: 'auto',
  },
  argTypes: {
    status: {
      control: 'select',
      options: ['ready', 'error'],
      description: 'Resultado simulado do carregamento do provedor anti-spam.',
    },
    action: { control: 'text', description: 'Ação enviada ao Turnstile para classificação do desafio.' },
    theme: {
      control: 'select',
      options: ['auto', 'light', 'dark'],
    },
  },
  decorators: [
    applicationConfig({
      providers: [provideCloudflareTurnstile({ siteKey: '1x00000000000000000000AA' })],
    }),
  ],
  parameters: {
    layout: 'centered',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<CloudflareTurnstileStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('button', { name: /verificação anti-spam/i })).toBeVisible();
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

export const DarkReducedMotion: Story = {
  args: {
    action: 'subscription-submit-night',
    theme: 'dark',
  },
  globals: { theme: 'dark', motion: 'reduced' },
};
