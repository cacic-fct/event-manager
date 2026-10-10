import { MediaMatcher } from '@angular/cdk/layout';
import { provideHttpClient } from '@angular/common/http';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import type { PublicPlatformStats } from '@cacic-fct/event-manager-public-contracts';
import { AuthService } from '@cacic-fct/shared-angular';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig, moduleMetadata } from '@storybook/angular';
import { HttpResponse, delay, http } from 'msw';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PublicFeatureFlagService } from '../feature-flags/public-feature-flag.service';
import { DefaultRedirectService } from './default-redirect.service';
import { LandingComponent } from './landing-page';
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
  prefersDarkScheme: boolean;
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
  prefersDarkScheme: false,
  defaultRedirectPath: '/calendar',
};

let activeArgs = defaultArgs;
const loginMock = fn(async () => undefined);
const navigateToDefaultMock = fn(async () => true);

const meta: Meta<LandingStoryArgs> = {
  component: LandingComponent,
  title: 'CACiC Eventos/Landing/Page',
  tags: ['autodocs', 'landing-showcase'],
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
    a11y: { test: 'error' },
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

export const DarkSystemPreference: Story = {
  args: { prefersDarkScheme: true },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('heading', { name: 'CACiC Eventos' })).toBeVisible();
  },
};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Entrar com o Google' })).toBeVisible();
    await expect(
      new URL(canvas.getByRole('link', { name: 'Explorar eventos' }).getAttribute('href') ?? '', window.location.origin).pathname,
    ).toBe('/calendar');
  },
};

export const Tablet: Story = {
  parameters: { viewport: { defaultViewport: 'tablet' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Entrar com o Google' })).toBeVisible();
    await expect(
      new URL(canvas.getByRole('link', { name: 'Explorar eventos' }).getAttribute('href') ?? '', window.location.origin).pathname,
    ).toBe('/calendar');
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
