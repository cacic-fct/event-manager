import { NgComponentOutlet } from '@angular/common';
import { Component, DestroyRef, DestroyableInjector, Injector, computed, inject, input } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import type { PublicPlatformStats } from '@cacic-fct/event-manager-public-contracts';
import { AuthService } from '@cacic-fct/shared-angular';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig, moduleMetadata } from '@storybook/angular';
import { NEVER, delay, of, throwError } from 'rxjs';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PublicFeatureFlagService } from '../feature-flags/public-feature-flag.service';
import { DefaultRedirectService } from './default-redirect.service';
import { LandingComponent } from './landing-page';
import { PlatformStatsApiService } from './platform-stats-api.service';
import { ProductShowcaseComponent } from './showcase/product-showcase';

type LandingStatsState = 'ready' | 'loading' | 'unavailable';

interface LandingStoryArgs {
  statsState: LandingStatsState;
  peopleCount: number;
  eventsCount: number;
  majorEventsCount: number;
  certificatesCount: number;
  latencyMs: number;
  authenticated: boolean;
  defaultRedirectPath: string;
}

const defaultArgs: LandingStoryArgs = {
  statsState: 'ready',
  peopleCount: 4_280,
  eventsCount: 172,
  majorEventsCount: 16,
  certificatesCount: 8_940,
  latencyMs: 180,
  authenticated: false,
  defaultRedirectPath: '/calendar',
};

const loginMock = fn(async () => undefined);
const navigateToDefaultMock = fn(async () => true);

@Component({
  selector: 'app-storybook-landing-host',
  imports: [NgComponentOutlet],
  template: `
    <ng-container
      [ngComponentOutlet]="component"
      [ngComponentOutletInjector]="storyInjector()" />
  `,
})
class LandingStoryHostComponent {
  private readonly parentInjector = inject(Injector);
  private readonly storyInjectors = new Set<DestroyableInjector>();
  private currentStoryInjector: DestroyableInjector | null = null;

  readonly component = LandingComponent;
  readonly statsState = input<LandingStatsState>('ready');
  readonly peopleCount = input(4_280);
  readonly eventsCount = input(172);
  readonly majorEventsCount = input(16);
  readonly certificatesCount = input(8_940);
  readonly latencyMs = input(180);
  readonly authenticated = input(false);
  readonly defaultRedirectPath = input('/calendar');

  private readonly storyArgs = computed<LandingStoryArgs>(() => ({
    statsState: this.statsState(),
    peopleCount: this.peopleCount(),
    eventsCount: this.eventsCount(),
    majorEventsCount: this.majorEventsCount(),
    certificatesCount: this.certificatesCount(),
    latencyMs: this.latencyMs(),
    authenticated: this.authenticated(),
    defaultRedirectPath: this.defaultRedirectPath(),
  }));

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      for (const storyInjector of this.storyInjectors) {
        storyInjector.destroy();
      }
      this.storyInjectors.clear();
    });
  }

  readonly storyInjector = computed(() => {
    const args = this.storyArgs();
    const stats: PublicPlatformStats = {
      peopleCount: args.peopleCount,
      eventsCount: args.eventsCount,
      majorEventsCount: args.majorEventsCount,
      certificatesCount: args.certificatesCount,
    };

    const storyInjector = Injector.create({
      parent: this.parentInjector,
      providers: [
        {
          provide: AuthService,
          useValue: { isAuthenticated: () => args.authenticated, login: loginMock },
        },
        {
          provide: PublicFeatureFlagService,
          useValue: {
            stringValue: (key: string) =>
              key === 'defaultLoginRedirectPath' ? args.defaultRedirectPath : undefined,
          },
        },
        {
          provide: DefaultRedirectService,
          useValue: { navigateToDefault: navigateToDefaultMock },
        },
        {
          provide: PlatformStatsApiService,
          useValue: {
            getPublicPlatformStats: () => {
              if (args.statsState === 'loading') {
                return NEVER;
              }
              if (args.statsState === 'unavailable') {
                return throwError(() => new Error('Simulated public statistics failure.'));
              }
              return of(stats).pipe(delay(args.latencyMs));
            },
          },
        },
      ],
    });
    const previousStoryInjector = this.currentStoryInjector;
    this.currentStoryInjector = storyInjector;
    this.storyInjectors.add(storyInjector);
    if (previousStoryInjector) {
      queueMicrotask(() => {
        if (this.storyInjectors.delete(previousStoryInjector)) {
          previousStoryInjector.destroy();
        }
      });
    }
    return storyInjector;
  });
}

const meta: Meta<LandingStoryArgs> = {
  component: LandingStoryHostComponent,
  title: 'Public/Landing/Page',
  tags: ['autodocs', 'landing-showcase'],
  args: defaultArgs,
  argTypes: {
    statsState: {
      control: { type: 'select', labels: { ready: 'Ready', loading: 'Loading', unavailable: 'Unavailable' } },
      options: ['ready', 'loading', 'unavailable'],
      description: 'Simulated state returned by the public statistics service.',
    },
    peopleCount: { control: { type: 'range', min: 0, max: 500_000, step: 100 }, description: 'Displayed attendee count.' },
    eventsCount: { control: { type: 'range', min: 0, max: 30_000, step: 10 }, description: 'Displayed event count.' },
    majorEventsCount: { control: { type: 'range', min: 0, max: 2_000, step: 1 }, description: 'Displayed major event count.' },
    certificatesCount: { control: { type: 'range', min: 0, max: 1_000_000, step: 100 }, description: 'Displayed issued certificate count.' },
    latencyMs: { control: { type: 'range', min: 0, max: 3_000, step: 100 }, description: 'Delay before ready statistics are returned.' },
    authenticated: { control: 'boolean', description: 'Simulate an authenticated visitor.' },
    defaultRedirectPath: { control: 'text', description: 'Fallback route used by the sign-in flow.' },
  },
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
      ],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
    docs: {
      description: {
        component:
          'Controls drive an isolated landing page instance with simulated authentication and public statistics. Changing an argument recreates the instance so service-backed values stay in sync.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<LandingStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Validar certificado' })).toBeVisible();
    await expect(await canvas.findByText('4.280')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Entrar com o Google' }));
    await expect(loginMock).toHaveBeenCalled();
  },
};

export const CuratedLargePlatform: Story = {
  args: {
    peopleCount: 428_500,
    eventsCount: 27_140,
    majorEventsCount: 1_380,
    certificatesCount: 918_600,
    latencyMs: 0,
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('428.500')).toBeVisible();
  },
};

export const ZeroedPlatform: Story = {
  args: { peopleCount: 0, eventsCount: 0, majorEventsCount: 0, certificatesCount: 0, latencyMs: 0 },
  play: async ({ canvasElement }) => {
    const zeroes = await within(canvasElement).findAllByText('0');
    await expect(zeroes).toHaveLength(4);
  },
};

export const StatisticsLoading: Story = {
  args: { statsState: 'loading' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/Carregando estatísticas/i)).toBeVisible();
  },
};

export const StatisticsUnavailable: Story = {
  args: { statsState: 'unavailable' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/estatísticas.*indisponíveis/i)).toBeVisible();
  },
};

export const Authenticated: Story = {
  args: { authenticated: true, defaultRedirectPath: '/my-day' },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Entrar com o Google' }));
    await expect(navigateToDefaultMock).toHaveBeenCalled();
  },
};

export const AttendeeJourney: Story = {
  render: () => ({ props: {}, template: '<app-landing-product-showcase />' }),
  decorators: [moduleMetadata({ imports: [ProductShowcaseComponent] })],
  parameters: { layout: 'fullscreen', a11y: { test: 'error' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const region = canvas.getByRole('region', { name: 'Você participa. Tudo se conecta.' });
    region.scrollIntoView();
    const participant = within(region);
    await userEvent.click(await participant.findByRole('button', { name: 'Meu dia' }));
    await userEvent.click(await participant.findByRole('button', { name: 'Ver no mapa' }));
    await userEvent.click(participant.getByRole('button', { name: 'Carteira' }));
    await userEvent.click(await participant.findByRole('button', { name: 'Bilhete para Kit de boas-vindas' }));
    await userEvent.click(participant.getByRole('button', { name: 'Autorregistro' }));
    const codeInput = participant.getByRole('textbox', { name: 'Código de presença' });
    await userEvent.clear(codeInput);
    await userEvent.type(codeInput, 'KC1C');
    await userEvent.click(participant.getByRole('button', { name: 'Confirmar presença' }));
    await expect(await participant.findByRole('heading', { name: 'Presença confirmada.' })).toBeVisible();
  },
};

export const OrganizerJourney: Story = {
  render: () => ({ props: {}, template: '<app-landing-product-showcase />' }),
  decorators: [moduleMetadata({ imports: [ProductShowcaseComponent] })],
  parameters: { layout: 'fullscreen', a11y: { test: 'error' } },
  play: async ({ canvasElement }) => {
    const region = within(canvasElement).getByRole('region', { name: /Você organiza\s*com tudo à mão\./ });
    region.scrollIntoView();
    const canvas = within(region);
    await userEvent.click(await canvas.findByRole('button', { name: 'Presenças' }));

    await userEvent.click(await canvas.findByRole('button', { name: 'Marcar como presente' }));
    await expect(canvas.getByRole('heading', { name: 'Rafael Almeida' })).toBeVisible();
    await userEvent.click(canvas.getByRole('radio', { name: 'Exibir lista' }));
    await expect(canvas.getByRole('list', { name: 'Pessoas inscritas' })).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: 'Certificados' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Emitir certificados pendentes' }));
    await expect(await canvas.findByText('Certificados disponíveis')).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: 'Sorteios' }));
    await expect(await canvas.findByRole('button', { name: 'Sortear' })).toBeVisible();
  },
};
