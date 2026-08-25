import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { EventAttendanceAnalyticsSnapshot } from '@cacic-fct/event-manager-admin-contracts';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { NEVER, delay, of, throwError } from 'rxjs';
import { AttendanceApiService } from '../../graphql/attendance-api.service';
import { PermissionsService } from '../../permissions/permissions.service';
import { AttendanceStatisticsPageComponent } from './attendance-statistics-page.component';
import { createAttendanceStatisticsSnapshot } from './attendance-statistics-story.fixtures';

type RequestState = 'ready' | 'loading' | 'error';

interface AttendanceStatisticsStoryArgs {
  actionFails: boolean;
  canReview: boolean;
  collectorCount: number;
  eventName: string;
  historyMinutes: number;
  noShowCount: number;
  pendingOfflineCount: number;
  presentCount: number;
  requestState: RequestState;
  responseDelay: number;
  reviewCount: number;
}

const eventId = 'event-command-center-demo';
const defaultArgs: AttendanceStatisticsStoryArgs = {
  actionFails: false,
  canReview: true,
  collectorCount: 4,
  eventName: 'Credenciamento e abertura da SECOMPP',
  historyMinutes: 60,
  noShowCount: 37,
  pendingOfflineCount: 12,
  presentCount: 284,
  requestState: 'ready',
  responseDelay: 80,
  reviewCount: 3,
};

const meta: Meta<AttendanceStatisticsStoryArgs> = {
  component: AttendanceStatisticsPageComponent,
  title: 'CACiC Eventos/Attendance/Statistics/Command Center',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    requestState: { control: 'inline-radio', options: ['ready', 'loading', 'error'] },
    eventName: { control: 'text', if: { arg: 'requestState', eq: 'ready' } },
    presentCount: { control: { type: 'range', min: 0, max: 2_000, step: 1 }, if: { arg: 'requestState', eq: 'ready' } },
    noShowCount: { control: { type: 'range', min: 0, max: 1_000, step: 1 }, if: { arg: 'requestState', eq: 'ready' } },
    pendingOfflineCount: {
      control: { type: 'range', min: 0, max: 100, step: 1 },
      if: { arg: 'requestState', eq: 'ready' },
    },
    reviewCount: { control: { type: 'range', min: 0, max: 12, step: 1 }, if: { arg: 'requestState', eq: 'ready' } },
    collectorCount: { control: { type: 'range', min: 0, max: 16, step: 1 }, if: { arg: 'requestState', eq: 'ready' } },
    historyMinutes: { control: 'select', options: [60, 240, 1_440, 10_080] },
    canReview: { control: 'boolean', if: { arg: 'requestState', eq: 'ready' } },
    actionFails: { control: 'boolean', if: { arg: 'canReview', eq: true } },
    responseDelay: { control: { type: 'range', min: 0, max: 2_000, step: 100 } },
  },
  render: (args) => ({
    props: {},
    applicationConfig: { providers: createStoryProviders(args) },
  }),
  parameters: { layout: 'fullscreen', a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<AttendanceStatisticsStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: defaultArgs.eventName })).toBeVisible();
    await expect(canvas.getByLabelText('Resumo geral de presença e destaque do período em foco')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Atualizar' })).toBeEnabled();
  },
};

export const EmptyWindow: Story = {
  name: 'Período sem coletas',
  args: { collectorCount: 0, noShowCount: 84, pendingOfflineCount: 0, presentCount: 0, reviewCount: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Nenhuma presença foi coletada neste período.')).toBeVisible();
    await expect(canvas.getByText('Nenhuma pessoa coletora aparece neste período.')).toBeVisible();
  },
};

export const DenseOperation: Story = {
  name: 'Operação densa com muitas revisões',
  args: { collectorCount: 16, pendingOfflineCount: 73, presentCount: 1_864, reviewCount: 12 },
};

export const ReadOnly: Story = {
  name: 'Somente leitura',
  args: { canReview: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Revisão humana')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Concluir' })).not.toBeInTheDocument();
  },
};

export const ReviewFailure: Story = {
  name: 'Falha ao concluir revisão',
  args: { actionFails: true, responseDelay: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const [button] = await canvas.findAllByRole('button', { name: 'Concluir' });
    if (!button) throw new Error('Expected at least one review action.');
    await userEvent.click(button);
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Não foi possível concluir a revisão.');
  },
};

export const Loading: Story = {
  args: { requestState: 'loading' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Preparando a central de presença...')).toBeVisible();
  },
};

export const ConnectionError: Story = {
  name: 'Atualização ao vivo interrompida',
  args: { requestState: 'error', responseDelay: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('alert')).toHaveTextContent('A conexão com a central foi interrompida.');
    await expect(canvas.getByRole('button', { name: 'Atualizar' })).toBeEnabled();
  },
};

export const LongContentOnMobile: Story = {
  name: 'Conteúdo extenso no celular',
  args: {
    eventName:
      'Credenciamento integrado dos cursos de Ciência da Computação, Sistemas de Informação e comunidades convidadas',
    collectorCount: 8,
    reviewCount: 6,
  },
  globals: { theme: 'dark', motion: 'reduced' },
  parameters: { viewport: { defaultViewport: 'mobile' } },
};

function createStoryProviders(args: AttendanceStatisticsStoryArgs) {
  const snapshot = createSnapshot(args);
  const response = <T>(value: T) => (args.responseDelay > 0 ? of(value).pipe(delay(args.responseDelay)) : of(value));
  return [
    provideRouter([]),
    { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ eventId }) } } },
    {
      provide: AttendanceApiService,
      useValue: {
        watchEventAttendanceAnalytics: () => {
          if (args.requestState === 'loading') return NEVER;
          if (args.requestState === 'error')
            return throwError(() => new Error('A conexão com a central foi interrompida.'));
          return response(snapshot);
        },
        getEventAttendanceAnalytics: () => response(snapshot),
        reviewAttendanceFlag: () =>
          args.actionFails
            ? throwError(() => new Error('Não foi possível concluir a revisão.'))
            : response(snapshot.reviewItems[0]),
      },
    },
    { provide: PermissionsService, useValue: { has: () => args.canReview } },
  ];
}

function createSnapshot(args: AttendanceStatisticsStoryArgs): EventAttendanceAnalyticsSnapshot {
  return createAttendanceStatisticsSnapshot({
    collectorCount: args.collectorCount,
    eventName: args.eventName,
    noShowCount: args.noShowCount,
    pendingOfflineCount: args.pendingOfflineCount,
    presentCount: args.presentCount,
    reviewCount: args.reviewCount,
    historyMinutes: args.historyMinutes,
  });
}
