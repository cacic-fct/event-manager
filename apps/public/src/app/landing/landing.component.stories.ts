import { provideHttpClient } from '@angular/common/http';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';
import { MediaMatcher } from '@angular/cdk/layout';
import { fakerPT_BR as faker } from '@faker-js/faker';
import { AuthService } from '@cacic-fct/shared-angular';
import type { PublicPlatformStats } from '@cacic-fct/event-manager-public-contracts';
import { HttpResponse, http } from 'msw';
import { PublicFeatureFlagService } from '../feature-flags/public-feature-flag.service';
import { LandingComponent } from './landing.component';

faker.seed(20260717);

const platformStats: PublicPlatformStats = {
  peopleCount: faker.number.int({ min: 100_000, max: 160_000 }),
  eventsCount: faker.number.int({ min: 5_000, max: 9_000 }),
  majorEventsCount: faker.number.int({ min: 250, max: 500 }),
  certificatesCount: faker.number.int({ min: 250_000, max: 400_000 }),
};

const meta: Meta<LandingComponent> = {
  component: LandingComponent,
  title: 'Public/Landing/Landing',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(),
        provideRouter([]),
        provideNoopAnimations(),
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: signal(false),
            login: async () => undefined,
          },
        },
        {
          provide: PublicFeatureFlagService,
          useValue: {
            stringValue: (key: string) => {
              if (key === 'defaultLoginRedirectPath') {
                return '/calendar';
              }

              return undefined;
            },
          },
        },
        {
          provide: MediaMatcher,
          useValue: {
            matchMedia: () => ({
              matches: false,
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
  },
};

export default meta;

type Story = StoryObj<LandingComponent>;

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);

  await userEvent.tab();

  const buttons = canvas.queryAllByRole('button');
  const enabledButton = buttons.find(
    (button) => !button.hasAttribute('disabled') && button.getAttribute('aria-disabled') !== 'true',
  );

  if (enabledButton) {
    await userEvent.hover(enabledButton);
    await expect(enabledButton).toBeVisible();
  }

  const links = canvas.queryAllByRole('link');

  if (links[0]) {
    await expect(links[0]).toBeVisible();
  }
};

export const Playground: Story = {
  args: {},
  globals: { theme: 'light' },
  parameters: {
    msw: {
      handlers: [platformStatsHandler(platformStats)],
    },
  },
  play: async ({ canvasElement }) => {
    await exerciseStory(canvasElement);
    await expect(within(canvasElement).getByRole('link', { name: 'Validar certificado' })).toBeVisible();
  },
};

export const EstatisticasIndisponiveis: Story = {
  args: {},
  globals: { theme: 'light' },
  parameters: {
    msw: {
      handlers: [
        platformStatsHandler(null),
      ],
    },
  },
};

export const Dark: Story = {
  args: {},
  globals: { theme: 'dark' },
  parameters: {
    msw: {
      handlers: [platformStatsHandler(platformStats)],
    },
  },
};

function platformStatsHandler(stats: PublicPlatformStats | null) {
  return http.post('/api/graphql', async ({ request }) => {
    const body = (await request.json()) as { query?: string };

    if (body.query?.includes('PublicPlatformStats')) {
      return HttpResponse.json(
        stats
          ? { data: { publicPlatformStats: stats } }
          : { errors: [{ message: 'As estatísticas simuladas estão indisponíveis.' }] },
      );
    }

    return HttpResponse.json({ data: {} });
  });
}
