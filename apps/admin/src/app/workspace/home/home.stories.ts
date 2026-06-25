import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { fakerPT_BR as faker } from '@faker-js/faker';
import { HttpResponse, delay, http } from 'msw';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { AuthService } from '@cacic-fct/shared-angular';
import type {
  DashboardActionLink,
  DashboardCalendarEvent,
  DashboardCertificatePendingItem,
  DashboardInconsistency,
  DashboardInsightAction,
  DashboardInsightSeverity,
  DashboardPendingOfflineAttendanceEvent,
  DashboardPendingReceiptMajorEvent,
  DashboardWeatherAlert,
  WorkspaceDashboardInsights,
} from '@cacic-fct/shared-frontend-types';
import { Home } from './home';

registerLocaleData(localePt);

type WorkspaceDashboardHomeInsights = Omit<WorkspaceDashboardInsights, 'permissions'>;

type DashboardStoryState = 'loaded' | 'empty' | 'loading' | 'error';

interface HomeStoryArgs {
  state: DashboardStoryState;
  organizerName: string;
  todayEvents: number;
  upcomingEvents: number;
  attendanceActions: boolean;
  suggestions: DashboardInsightAction[];
  weatherAlerts: number;
  pendingCertificates: number;
  pendingOfflineAttendancesCount: number;
  pendingReceiptValidationsCount: number;
  duplicatePeopleCount: number;
  inconsistencies: number;
  criticalInconsistencies: boolean;
}

const now = new Date('2026-05-24T10:30:00.000-03:00');
let activeArgs: HomeStoryArgs;

const defaultArgs: HomeStoryArgs = {
  state: 'loaded',
  organizerName: 'Ana Clara',
  todayEvents: 2,
  upcomingEvents: 3,
  attendanceActions: true,
  suggestions: ['CREATE_EVENT_GROUP', 'CREATE_EVENT', 'CREATE_MAJOR_EVENT'],
  weatherAlerts: 1,
  pendingCertificates: 2,
  pendingOfflineAttendancesCount: 5,
  pendingReceiptValidationsCount: 4,
  duplicatePeopleCount: 3,
  inconsistencies: 3,
  criticalInconsistencies: true,
};

const storyUser = signal({
  sub: 'storybook-user',
  email: 'organizador@cacic.dev.br',
  roles: ['organizer'],
  scopes: [],
  claims: { name: defaultArgs.organizerName },
});

const meta: Meta<HomeStoryArgs> = {
  component: Home,
  title: 'CACiC Eventos/Workspace/Home/Home',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(),
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        {
          provide: AuthService,
          useValue: {
            user: storyUser,
            getAccessToken: () => null,
          },
        },
      ],
    }),
  ],
  args: defaultArgs,
  argTypes: {
    state: {
      control: 'select',
      options: ['loaded', 'empty', 'loading', 'error'],
    },
    organizerName: { control: 'text' },
    todayEvents: { control: { type: 'range', min: 0, max: 8, step: 1 } },
    upcomingEvents: { control: { type: 'range', min: 0, max: 12, step: 1 } },
    attendanceActions: { control: 'boolean' },
    suggestions: {
      control: 'check',
      options: ['CREATE_EVENT_GROUP', 'CREATE_EVENT', 'CREATE_MAJOR_EVENT'],
    },
    weatherAlerts: { control: { type: 'range', min: 0, max: 5, step: 1 } },
    pendingCertificates: { control: { type: 'range', min: 0, max: 6, step: 1 } },
    pendingOfflineAttendancesCount: { control: { type: 'range', min: 0, max: 20, step: 1 } },
    pendingReceiptValidationsCount: { control: { type: 'range', min: 0, max: 20, step: 1 } },
    duplicatePeopleCount: { control: { type: 'range', min: 0, max: 20, step: 1 } },
    inconsistencies: { control: { type: 'range', min: 0, max: 8, step: 1 } },
    criticalInconsistencies: { control: 'boolean' },
  },
  render: (args) => {
    activeArgs = args;
    storyUser.set({
      sub: 'storybook-user',
      email: 'organizador@cacic.dev.br',
      roles: ['organizer'],
      scopes: [],
      claims: { name: args.organizerName },
    });
    return {
      props: {},
    };
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
    msw: {
      handlers: [
        http.post('/api/graphql', async () => {
          const args = activeArgs ?? defaultArgs;
          if (args.state === 'loading') {
            await delay('infinite');
          }

          if (args.state === 'error') {
            return HttpResponse.json({
              errors: [{ message: 'Falha simulada ao buscar insights do workspace.' }],
            });
          }

          return HttpResponse.json({
            data: {
              workspaceDashboardInsights: buildDashboardInsights(args),
            },
          });
        }),
      ],
    },
  },
};

export default meta;

type Story = StoryObj<HomeStoryArgs>;

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
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const EmptyDashboard: Story = {
  args: {
    state: 'empty',
    todayEvents: 0,
    upcomingEvents: 0,
    suggestions: ['CREATE_EVENT_GROUP', 'CREATE_EVENT', 'CREATE_MAJOR_EVENT'],
    weatherAlerts: 0,
    pendingCertificates: 0,
    pendingOfflineAttendancesCount: 0,
    pendingReceiptValidationsCount: 0,
    duplicatePeopleCount: 0,
    inconsistencies: 0,
  },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const Loading: Story = {
  args: {
    state: 'loading',
  },
  globals: { theme: 'light' },
};

export const ErrorState: Story = {
  args: {
    state: 'error',
  },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Não foi possível carregar o painel')).toBeVisible();
  },
};

function buildDashboardInsights(args: HomeStoryArgs): WorkspaceDashboardHomeInsights {
  const empty = args.state === 'empty';

  return {
    generatedAt: now.toISOString(),
    summary: {
      eventsCount: empty ? 0 : args.todayEvents + args.upcomingEvents,
      eventGroupsCount: empty ? 0 : 4,
      majorEventsCount: empty ? 0 : 2,
    },
    suggestions: buildSuggestions(args.suggestions),
    calendarEvents: empty
      ? []
      : [
          ...Array.from({ length: args.todayEvents }, (_, index) => buildCalendarEvent(index, 0, args)),
          ...Array.from({ length: args.upcomingEvents }, (_, index) => buildCalendarEvent(index, index + 1, args)),
        ],
    weatherAlerts: empty ? [] : Array.from({ length: args.weatherAlerts }, (_, index) => buildWeatherAlert(index)),
    pendingCertificates: empty
      ? []
      : Array.from({ length: args.pendingCertificates }, (_, index) => buildPendingCertificate(index)),
    pendingOfflineAttendancesCount: empty ? 0 : args.pendingOfflineAttendancesCount,
    pendingOfflineAttendanceEvents: empty ? [] : buildPendingOfflineAttendanceEvents(args.pendingOfflineAttendancesCount),
    pendingReceiptValidationsCount: empty ? 0 : args.pendingReceiptValidationsCount,
    pendingReceiptMajorEvents: empty ? [] : buildPendingReceiptMajorEvents(args.pendingReceiptValidationsCount),
    inconsistencies: empty
      ? []
      : Array.from({ length: args.inconsistencies }, (_, index) => buildInconsistency(index, args)),
    duplicatePeopleCount: empty ? 0 : args.duplicatePeopleCount,
  };
}

function buildSuggestions(actions: DashboardInsightAction[]): DashboardActionLink[] {
  const labels: Partial<Record<DashboardInsightAction, string>> = {
    CREATE_EVENT_GROUP: 'Criar grupo de eventos',
    CREATE_EVENT: 'Criar evento',
    CREATE_MAJOR_EVENT: 'Criar grande evento',
  };

  return actions.map((action) => ({ action, label: labels[action] ?? action }));
}

function buildCalendarEvent(index: number, daysFromNow: number, args: HomeStoryArgs): DashboardCalendarEvent {
  const startDate = dateFromNow(daysFromNow, 9 + (index % 8));
  const type = faker.helpers.arrayElement(['MINICURSO', 'PALESTRA', 'OTHER']);

  return {
    id: `event-${daysFromNow}-${index}`,
    name: faker.helpers.arrayElement([
      'Arquitetura Angular com Signals',
      'Observabilidade para APIs GraphQL',
      'Acessibilidade em produtos digitais',
      'Design systems para eventos',
      'Boas práticas com Prisma e NestJS',
      'Testes visuais em componentes',
    ]),
    emoji: faker.helpers.arrayElement(['💻', '🚀', '🎓', '🔐', '📊']),
    type,
    startDate: startDate.toISOString(),
    endDate: addHours(startDate, type === 'MINICURSO' ? 3 : 1).toISOString(),
    locationDescription: faker.helpers.arrayElement(['Auditório Discente', 'Lab 3', 'Sala B12', null]),
    majorEventName: index % 2 === 0 ? 'Semana da Computação' : null,
    eventGroupName: index % 3 === 0 ? 'Trilha de Desenvolvimento' : null,
    attendancesCount: faker.number.int({ min: 8, max: 120 }),
    subscriptionsCount: faker.number.int({ min: 12, max: 160 }),
    shouldCollectAttendance: true,
    canCollectAttendanceNow: args.attendanceActions && daysFromNow === 0 && index < 2,
  };
}

function buildWeatherAlert(index: number): DashboardWeatherAlert {
  const forecastTime = dateFromNow(index, 14);

  return {
    eventId: `weather-event-${index}`,
    eventName: faker.helpers.arrayElement(['Minicurso de Angular', 'Palestra de Segurança', 'Workshop de Dados']),
    summary: faker.helpers.arrayElement(['Chuva moderada', 'Calor intenso', 'Tempo instável']),
    materialIcon: faker.helpers.arrayElement(['rainy', 'thermostat', 'cloud']),
    forecastTime: forecastTime.toISOString(),
    temperature: faker.number.int({ min: 18, max: 35 }),
  };
}

function buildPendingCertificate(index: number): DashboardCertificatePendingItem {
  const targetType = faker.helpers.arrayElement(['EVENT', 'EVENT_GROUP', 'MAJOR_EVENT'] as const);

  return {
    targetType,
    targetId: `certificate-target-${index}`,
    title: faker.helpers.arrayElement(['Semana da Computação', 'Minicurso de NestJS', 'Trilha Frontend']),
    subtitle: faker.helpers.arrayElement([
      '58 participantes elegíveis',
      '12 certificados prontos',
      'Aguardando revisão',
    ]),
    finishedAt: dateFromNow(-index - 1, 18).toISOString(),
  };
}

function buildPendingReceiptMajorEvents(totalCount: number): DashboardPendingReceiptMajorEvent[] {
  if (totalCount === 0) {
    return [];
  }

  const firstCount = Math.ceil(totalCount / 2);
  const counts = totalCount === firstCount ? [firstCount] : [firstCount, totalCount - firstCount];
  return counts.map((pendingCount, index) => ({
    majorEventId: `receipt-major-${index}`,
    name: faker.helpers.arrayElement(['Semana da Computação', 'CACiC Tech Week', 'Jornada de Dados']),
    emoji: faker.helpers.arrayElement(['💻', '🎓', '📊']),
    startDate: dateFromNow(index + 3, 8).toISOString(),
    endDate: dateFromNow(index + 5, 18).toISOString(),
    pendingCount,
  }));
}

function buildPendingOfflineAttendanceEvents(totalCount: number): DashboardPendingOfflineAttendanceEvent[] {
  if (totalCount === 0) {
    return [];
  }

  const firstCount = Math.ceil(totalCount / 2);
  const counts = totalCount === firstCount ? [firstCount] : [firstCount, totalCount - firstCount];
  return counts.map((pendingCount, index) => ({
    eventId: `offline-attendance-event-${index}`,
    name: faker.helpers.arrayElement(['Credenciamento geral', 'Minicurso de Angular', 'Palestra de Segurança']),
    emoji: faker.helpers.arrayElement(['✅', '💻', '🔐']),
    startDate: dateFromNow(-index - 1, 19).toISOString(),
    endDate: dateFromNow(-index - 1, 21).toISOString(),
    pendingCount,
  }));
}

function buildInconsistency(index: number, args: HomeStoryArgs): DashboardInconsistency {
  const severity: DashboardInsightSeverity =
    args.criticalInconsistencies && index === 0
      ? 'CRITICAL'
      : faker.helpers.arrayElement<DashboardInsightSeverity>(['INFO', 'WARNING']);

  return {
    type: faker.helpers.arrayElement([
      'EVENT_GROUP_WITH_SINGLE_EVENT',
      'PAST_CERTIFICATE_EVENT_WITHOUT_ATTENDANCE',
      'EVENT_WITHOUT_LECTURER',
      'SUSPICIOUS_DATE',
      'PLACEHOLDER_EMOJI',
    ]),
    action: faker.helpers.arrayElement(['OPEN_EVENT', 'OPEN_ATTENDANCE', 'OPEN_CERTIFICATES']),
    targetId: `issue-target-${index}`,
    severity,
    title: faker.helpers.arrayElement([
      'Evento sem ministrante',
      'Certificado pendente sem presença',
      'Data fora do intervalo do grupo',
      'Emoji padrão ainda em uso',
    ]),
    description: faker.helpers.arrayElement([
      'Revise o cadastro para evitar problemas na divulgação.',
      'A emissão de certificados depende de uma conferência manual.',
      'A atividade parece estar fora do período esperado.',
    ]),
    eventId: `issue-event-${index}`,
    relatedEventId: index % 2 === 0 ? `related-event-${index}` : null,
    personId: index % 3 === 0 ? `person-${index}` : null,
  };
}

function dateFromNow(days: number, hour: number): Date {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function addHours(date: Date, hours: number): Date {
  const next = new Date(date);
  next.setHours(next.getHours() + hours);
  return next;
}
