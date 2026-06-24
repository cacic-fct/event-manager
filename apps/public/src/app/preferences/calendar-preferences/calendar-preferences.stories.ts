import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { ChangeDetectionStrategy, Component, LOCALE_ID, input } from '@angular/core';
import { fakerPT_BR as faker } from '@faker-js/faker';
import { HttpResponse, delay, http } from 'msw';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import type { CurrentUserCalendarFeedSettings } from './calendar-preferences-api.service';
import { CalendarPreferences } from './calendar-preferences';

registerLocaleData(localePt);

type CalendarFeedRequestState = 'success' | 'loading' | 'error';

type CalendarPreferencesStoryArgs = {
  requestState: CalendarFeedRequestState;
  enabled: boolean;
  includeFeedUrl: boolean;
  disabledAutomatically: boolean;
  responseDelay: number;
  renderKey: number;
};

type GraphqlBody = {
  query?: string;
  variables?: Record<string, unknown>;
};

const defaultArgs: CalendarPreferencesStoryArgs = {
  requestState: 'success',
  enabled: true,
  includeFeedUrl: true,
  disabledAutomatically: false,
  responseDelay: 100,
  renderKey: 0,
};

let activeArgs = defaultArgs;
let enabledOverride: boolean | null = null;
let rotationVersion = 0;
let storyRenderKey = 0;

@Component({
  selector: 'app-storybook-calendar-preferences-host',
  imports: [CalendarPreferences],
  template: `
    @if (renderKey() % 2 === 0) {
      <app-calendar-preferences />
    } @else {
      <app-calendar-preferences />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class CalendarPreferencesStoryHostComponent {
  readonly renderKey = input(0);
}

const meta: Meta<CalendarPreferencesStoryArgs> = {
  component: CalendarPreferencesStoryHostComponent,
  title: 'Public/Preferences/Calendar Preferences',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
    }),
  ],
  args: defaultArgs,
  argTypes: {
    requestState: {
      control: 'select',
      options: ['success', 'loading', 'error'],
      description: 'Resposta simulada pela API GraphQL.',
    },
    enabled: {
      control: 'boolean',
      description: 'Estado inicial do feed privado.',
      if: { arg: 'requestState', eq: 'success' },
    },
    includeFeedUrl: {
      control: 'boolean',
      description: 'Retorna ou remove o link iCal privado.',
      if: { arg: 'requestState', eq: 'success' },
    },
    disabledAutomatically: {
      control: 'boolean',
      description: 'Simula desativação automática por login antigo.',
      if: { arg: 'requestState', eq: 'success' },
    },
    responseDelay: {
      control: { type: 'range', min: 0, max: 1500, step: 100 },
      description: 'Latência simulada pela API em milissegundos.',
    },
    renderKey: {
      table: { disable: true },
      control: false,
    },
  },
  render: (args) => {
    activeArgs = args;
    enabledOverride = null;
    rotationVersion = 0;
    storyRenderKey += 1;
    return { props: { ...args, renderKey: storyRenderKey } };
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
    msw: {
      handlers: [
        http.post('/api/graphql', async ({ request }) => {
          const body = (await request.json()) as GraphqlBody;
          const query = body.query ?? '';

          if (activeArgs.requestState === 'loading') {
            await delay('infinite');
          }

          await delay(activeArgs.responseDelay);

          if (query.includes('SetCurrentUserCalendarFeedEnabled')) {
            enabledOverride = Boolean(body.variables?.['enabled']);
            return HttpResponse.json({
              data: {
                setCurrentUserCalendarFeedEnabled: buildSettings(activeArgs),
              },
            });
          }

          if (query.includes('RotateCurrentUserCalendarFeedKey')) {
            rotationVersion += 1;
            return HttpResponse.json({
              data: {
                rotateCurrentUserCalendarFeedKey: buildSettings(activeArgs),
              },
            });
          }

          if (activeArgs.requestState === 'error') {
            return HttpResponse.json({
              errors: [{ message: 'Não foi possível carregar as preferências de calendário simuladas.' }],
            });
          }

          if (query.includes('CurrentUserCalendarFeedSettings')) {
            return HttpResponse.json({
              data: {
                currentUserCalendarFeedSettings: buildSettings(activeArgs),
              },
            });
          }

          return HttpResponse.json({ data: {} });
        }),
      ],
    },
  },
};

export default meta;

type Story = StoryObj<CalendarPreferencesStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Feed privado')).toBeVisible();
    await userEvent.hover((await canvas.findAllByRole('button', { name: /copiar link/i }))[0]);
  },
};

export const DisabledAutomatically: Story = {
  args: {
    enabled: false,
    disabledAutomatically: true,
    responseDelay: 0,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Feed desativado automaticamente')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: /copiar link/i })).not.toBeInTheDocument();
  },
};

export const LinkUnavailable: Story = {
  args: {
    includeFeedUrl: false,
    responseDelay: 0,
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Link privado indisponível')).toBeVisible();
  },
};

export const RequestError: Story = {
  args: {
    requestState: 'error',
    responseDelay: 0,
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Não foi possível carregar as preferências de calendário simuladas.'),
    ).toBeVisible();
  },
};

export const Loading: Story = {
  args: {
    requestState: 'loading',
  },
};

function buildSettings(args: CalendarPreferencesStoryArgs): CurrentUserCalendarFeedSettings {
  const enabled = enabledOverride ?? args.enabled;

  return {
    enabled,
    feedPath: args.includeFeedUrl ? feedPath(args) : null,
    disabledAt: args.disabledAutomatically ? disabledAt(args) : null,
    disabledReason: args.disabledAutomatically ? 'STALE_LOGIN' : null,
  };
}

function disabledAt(args: CalendarPreferencesStoryArgs): string {
  faker.seed(storySeed(args));
  return faker.date.between({ from: '2026-06-01T12:00:00.000Z', to: '2026-06-23T12:00:00.000Z' }).toISOString();
}

function feedPath(args: CalendarPreferencesStoryArgs): string {
  faker.seed(storySeed(args) + rotationVersion);
  const calendarSlug = faker.helpers.slugify(faker.commerce.productName()).toLocaleLowerCase('pt-BR');
  const token = faker.string.uuid();

  return `/api/calendar/feeds/${calendarSlug}.ics?key=${token}`;
}

function storySeed(args: CalendarPreferencesStoryArgs): number {
  return 20260623 + (args.enabled ? 10 : 0) + (args.disabledAutomatically ? 5 : 0);
}
