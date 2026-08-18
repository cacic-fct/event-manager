import { MediaMatcher } from '@angular/cdk/layout';
import { provideHttpClient } from '@angular/common/http';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import type { PublicPlatformStats } from '@cacic-fct/event-manager-public-contracts';
import { AuthService } from '@cacic-fct/shared-angular';
import { fakerPT_BR as faker } from '@faker-js/faker';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { HttpResponse, delay, http } from 'msw';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PublicFeatureFlagService } from '../feature-flags/public-feature-flag.service';
import { DefaultRedirectService } from './default-redirect.service';
import { LandingComponent } from './landing-page';

type LandingStatsState = 'ready' | 'loading' | 'unavailable';

interface LandingStoryArgs {
  statsState: LandingStatsState;
  peopleCount: number;
  eventsCount: number;
  majorEventsCount: number;
  certificatesCount: number;
  latencyMs: number;
  authenticated: boolean;
  prefersDarkScheme: boolean;
  defaultRedirectPath: string;
}

const defaultArgs: LandingStoryArgs = {
  statsState: 'ready',
  peopleCount: 128_540,
  eventsCount: 7_430,
  majorEventsCount: 382,
  certificatesCount: 318_900,
  latencyMs: 180,
  authenticated: false,
  prefersDarkScheme: false,
  defaultRedirectPath: '/calendar',
};

let activeArgs = defaultArgs;
const loginMock = fn(async () => undefined);
const navigateToDefaultMock = fn(async () => true);

faker.seed(20_260_717);

const meta: Meta<LandingStoryArgs> = {
  component: LandingComponent,
  title: 'CACiC Eventos/Landing/Page',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    statsState: { control: 'select', options: ['ready', 'loading', 'unavailable'] },
    peopleCount: { control: { type: 'range', min: 0, max: 500_000, step: 100 } },
    eventsCount: { control: { type: 'range', min: 0, max: 30_000, step: 10 } },
    majorEventsCount: { control: { type: 'range', min: 0, max: 2_000, step: 1 } },
    certificatesCount: { control: { type: 'range', min: 0, max: 1_000_000, step: 100 } },
    latencyMs: { control: { type: 'range', min: 0, max: 3_000, step: 100 } },
    authenticated: { control: 'boolean' },
    prefersDarkScheme: { control: 'boolean' },
    defaultRedirectPath: { control: 'text' },
  },
  render: (args) => {
    activeArgs = { ...defaultArgs, ...args };
    return { props: {} };
  },
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(),
        provideRouter([]),
        provideNoopAnimations(),
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: () => activeArgs.authenticated,
            login: loginMock,
          },
        },
        {
          provide: PublicFeatureFlagService,
          useValue: {
            stringValue: (key: string) =>
              key === 'defaultLoginRedirectPath' ? activeArgs.defaultRedirectPath : undefined,
          },
        },
        {
          provide: DefaultRedirectService,
          useValue: { navigateToDefault: navigateToDefaultMock },
        },
        {
          provide: MediaMatcher,
          useValue: {
            matchMedia: () => ({
              matches: activeArgs.prefersDarkScheme,
              addEventListener: () => undefined,
              removeEventListener: () => undefined,
            }),
          },
        },
      ],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
    msw: { handlers: { graphql: [platformStatsHandler()] } },
    docs: {
      description: {
        component: 'Landing page with editable delayed aggregate statistics, authentication, and color-scheme states.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<LandingStoryArgs>;

export const Playground: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Validar certificado' })).toBeVisible();
    await expect(await canvas.findByText('128.540')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Entrar com o Google' }));
    await expect(loginMock).toHaveBeenCalled();
  },
};

export const GeneratedLargePlatform: Story = {
  args: {
    peopleCount: faker.number.int({ min: 400_000, max: 500_000 }),
    eventsCount: faker.number.int({ min: 20_000, max: 30_000 }),
    majorEventsCount: faker.number.int({ min: 1_200, max: 2_000 }),
    certificatesCount: faker.number.int({ min: 800_000, max: 1_000_000 }),
    latencyMs: 0,
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/mil/)).toBeVisible();
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

export const DarkSystemPreference: Story = {
  args: { prefersDarkScheme: true },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('CACiC Eventos')).toBeVisible();
  },
};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Entrar com o Google' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Explorar' })).toBeVisible();
  },
};

function platformStatsHandler() {
  return http.post('/api/graphql', async ({ request }) => {
    const body = (await request.json()) as { query?: string };
    if (!body.query?.includes('PublicPlatformStats')) {
      return HttpResponse.json({ data: {} });
    }

    if (activeArgs.statsState === 'loading') {
      await delay('infinite');
    } else if (activeArgs.latencyMs > 0) {
      await delay(activeArgs.latencyMs);
    }

    if (activeArgs.statsState === 'unavailable') {
      return HttpResponse.json({ errors: [{ message: 'As estatísticas simuladas estão indisponíveis.' }] });
    }

    const stats: PublicPlatformStats = {
      peopleCount: activeArgs.peopleCount,
      eventsCount: activeArgs.eventsCount,
      majorEventsCount: activeArgs.majorEventsCount,
      certificatesCount: activeArgs.certificatesCount,
    };
    return HttpResponse.json({ data: { publicPlatformStats: stats } });
  });
}
