import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { ChangeDetectionStrategy, Component, LOCALE_ID, computed, input, signal } from '@angular/core';
import { AuthService } from '@cacic-fct/shared-angular';
import { EventManagerKeycloakRole } from '@cacic-fct/shared-permissions';
import { fakerPT_BR as faker } from '@faker-js/faker';
import { HttpResponse, delay, http } from 'msw';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import type {
  CurrentUserAdminCalendarFeedSettings,
  SuperAdminCalendarFeedSettings,
} from '../../../graphql/admin-calendar-feed-settings-api.service';
import { WorkspacePreferencesTabComponent } from './workspace-preferences-tab.component';

registerLocaleData(localePt);

type CalendarFeedProfile = 'admin' | 'super-admin';
type CalendarFeedRequestState = 'success' | 'loading' | 'error';

type WorkspacePreferencesStoryArgs = {
  profile: CalendarFeedProfile;
  requestState: CalendarFeedRequestState;
  personalEnabled: boolean;
  includeFeedUrl: boolean;
  disabledAutomatically: boolean;
  includeActivity: boolean;
  responseDelay: number;
  renderKey: number;
};

type GraphqlBody = {
  query?: string;
  variables?: Record<string, unknown>;
};

const defaultArgs: WorkspacePreferencesStoryArgs = {
  profile: 'admin',
  requestState: 'success',
  personalEnabled: true,
  includeFeedUrl: true,
  disabledAutomatically: false,
  includeActivity: true,
  responseDelay: 100,
  renderKey: 0,
};

const storyRoles = signal<string[]>(['admin']);
const storyUser = computed(() => ({
  sub: 'storybook-admin',
  preferredUsername: 'storybook-admin',
  email: 'admin@example.com',
  roles: storyRoles(),
  scopes: ['profile', 'email'],
  permissions: [],
  claims: {
    name: 'Storybook Admin',
    preferred_username: 'storybook-admin',
    email: 'admin@example.com',
    is_onboarded: true,
  },
}));

const storyAuthService = {
  user: storyUser,
  roles: storyRoles,
  scopes: () => ['profile', 'email'],
  isAuthenticated: () => true,
  initialize: async () => undefined,
  login: async () => undefined,
  logout: async () => undefined,
  getAccessToken: () => null,
};

let activeArgs = defaultArgs;
let personalEnabledOverride: boolean | null = null;
let rotationVersion = 0;
let storyRenderKey = 0;

@Component({
  selector: 'app-storybook-workspace-preferences-tab-host',
  imports: [WorkspacePreferencesTabComponent],
  template: `
    @if (renderKey() % 2 === 0) {
      <app-workspace-preferences-tab />
    } @else {
      <app-workspace-preferences-tab />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class WorkspacePreferencesTabStoryHostComponent {
  readonly renderKey = input(0);
}

const meta: Meta<WorkspacePreferencesStoryArgs> = {
  component: WorkspacePreferencesTabStoryHostComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Preferences/Workspace Preferences Tab',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        { provide: AuthService, useValue: storyAuthService },
      ],
    }),
  ],
  args: defaultArgs,
  argTypes: {
    profile: {
      control: 'select',
      options: ['admin', 'super-admin'],
      description: 'Perfil usado para alternar entre feed pessoal e feed compartilhado.',
    },
    requestState: {
      control: 'select',
      options: ['success', 'loading', 'error'],
      description: 'Resposta simulada pela API GraphQL.',
    },
    personalEnabled: {
      control: 'boolean',
      description: 'Estado inicial do feed administrativo pessoal.',
      if: { arg: 'profile', eq: 'admin' },
    },
    includeFeedUrl: {
      control: 'boolean',
      description: 'Retorna ou remove o link iCal privado.',
      if: { arg: 'requestState', eq: 'success' },
    },
    disabledAutomatically: {
      control: 'boolean',
      description: 'Simula o motivo de desativação automática do feed pessoal.',
      if: { arg: 'profile', eq: 'admin' },
    },
    includeActivity: {
      control: 'boolean',
      description: 'Exibe datas de leitura, rotação e alteração no feed compartilhado.',
      if: { arg: 'profile', eq: 'super-admin' },
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
    personalEnabledOverride = null;
    rotationVersion = 0;
    storyRoles.set(args.profile === 'super-admin' ? [EventManagerKeycloakRole.SuperAdmin] : ['admin']);
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

          if (query.includes('SetCurrentUserAdminCalendarFeedEnabled')) {
            personalEnabledOverride = Boolean(body.variables?.['enabled']);
            return HttpResponse.json({
              data: {
                setCurrentUserAdminCalendarFeedEnabled: buildCurrentUserSettings(activeArgs),
              },
            });
          }

          if (query.includes('RotateCurrentUserAdminCalendarFeedKey')) {
            rotationVersion += 1;
            return HttpResponse.json({
              data: {
                rotateCurrentUserAdminCalendarFeedKey: buildCurrentUserSettings(activeArgs),
              },
            });
          }

          if (query.includes('RotateSuperAdminCalendarFeedKey')) {
            rotationVersion += 1;
            return HttpResponse.json({
              data: {
                rotateSuperAdminCalendarFeedKey: buildSuperAdminSettings(activeArgs),
              },
            });
          }

          if (activeArgs.requestState === 'error') {
            return HttpResponse.json({
              errors: [{ message: 'Não foi possível carregar as preferências de calendário simuladas.' }],
            });
          }

          if (query.includes('CurrentUserAdminCalendarFeedSettings')) {
            return HttpResponse.json({
              data: {
                currentUserAdminCalendarFeedSettings: buildCurrentUserSettings(activeArgs),
              },
            });
          }

          if (query.includes('SuperAdminCalendarFeedSettings')) {
            return HttpResponse.json({
              data: {
                superAdminCalendarFeedSettings: buildSuperAdminSettings(activeArgs),
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

type Story = StoryObj<WorkspacePreferencesStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Feed administrativo')).toBeVisible();
    await userEvent.hover((await canvas.findAllByRole('button', { name: /copiar link/i }))[0]);
  },
};

export const DisabledAutomatically: Story = {
  args: {
    personalEnabled: false,
    disabledAutomatically: true,
    responseDelay: 0,
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Feed desativado automaticamente')).toBeVisible();
  },
};

export const SuperAdminFeed: Story = {
  args: {
    profile: 'super-admin',
    responseDelay: 0,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Feed compartilhado de super-admins')).toBeVisible();
    await userEvent.hover(await canvas.findByRole('button', { name: /invalidar para todos/i }));
  },
};

export const LinkUnavailable: Story = {
  args: {
    includeFeedUrl: false,
    includeActivity: false,
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

function buildCurrentUserSettings(args: WorkspacePreferencesStoryArgs): CurrentUserAdminCalendarFeedSettings {
  const enabled = personalEnabledOverride ?? args.personalEnabled;

  return {
    enabled,
    feedPath: args.includeFeedUrl ? feedPath('admin', args) : null,
    disabledAt: args.disabledAutomatically ? disabledAt(args) : null,
    disabledReason: args.disabledAutomatically ? 'NO_CURRENT_ADMIN_TARGETS' : null,
  };
}

function buildSuperAdminSettings(args: WorkspacePreferencesStoryArgs): SuperAdminCalendarFeedSettings {
  const dates = feedActivityDates(args, 8);

  return {
    enabled: true,
    feedPath: args.includeFeedUrl ? feedPath('super-admin', args) : null,
    lastFetchedAt: dates.lastFetchedAt,
    rotatedAt: dates.rotatedAt,
    updatedAt: dates.updatedAt,
  };
}

function feedActivityDates(args: WorkspacePreferencesStoryArgs, seedOffset: number) {
  if (!args.includeActivity) {
    return {
      lastFetchedAt: null,
      rotatedAt: null,
      updatedAt: null,
    };
  }

  faker.seed(storySeed(args, seedOffset));
  const updatedAt = faker.date.between({ from: '2026-06-01T12:00:00.000Z', to: '2026-06-23T12:00:00.000Z' });

  return {
    lastFetchedAt: faker.date.recent({ days: 2, refDate: updatedAt }).toISOString(),
    rotatedAt: faker.date.recent({ days: 10, refDate: updatedAt }).toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

function disabledAt(args: WorkspacePreferencesStoryArgs): string {
  faker.seed(storySeed(args));
  return faker.date.between({ from: '2026-06-01T12:00:00.000Z', to: '2026-06-23T12:00:00.000Z' }).toISOString();
}

function feedPath(kind: CalendarFeedProfile, args: WorkspacePreferencesStoryArgs): string {
  faker.seed(storySeed(args, kind === 'admin' ? 20 : 40) + rotationVersion);
  const calendarSlug = faker.helpers.slugify(faker.company.catchPhrase()).toLocaleLowerCase('pt-BR');
  const token = faker.string.uuid();

  if (kind === 'super-admin') {
    return `/api/calendar/super-admin-feed/${calendarSlug}.ics?key=${token}`;
  }

  return `/api/calendar/admin-feed/${calendarSlug}.ics?key=${token}`;
}

function storySeed(args: WorkspacePreferencesStoryArgs, offset = 0): number {
  return (
    20260623 +
    offset +
    (args.profile === 'super-admin' ? 100 : 0) +
    (args.personalEnabled ? 10 : 0) +
    (args.disabledAutomatically ? 5 : 0)
  );
}
