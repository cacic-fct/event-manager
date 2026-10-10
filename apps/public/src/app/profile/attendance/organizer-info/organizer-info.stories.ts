import { withScenarioControls } from '@cacic-fct/shared-angular/storybook';
import { PLATFORM_ID } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { EventTargetType } from '@cacic-fct/event-manager-public-contracts';
import { RouteErrorService } from '@cacic-fct/shared-angular/errors';
import { applicationConfig, type Decorator, type Meta, type StoryObj } from '@storybook/angular';
import { NEVER, of, throwError } from 'rxjs';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';
import { CertificateFileDownloadService } from '../../../shared/certificate-file-download.service';
import {
  createPublicStoryEventFromControls,
  publicEventStoryControlArgTypes,
  publicEventStoryDefaultControls,
  type PublicEventStoryControls,
} from '../../../testing/public-event-story-fixtures';
import { AttendancesApiService, type OrganizerEventInfo, type OrganizerInfo } from '../attendances-api.service';
import { OrganizerInfoComponent } from './organizer-info';

type OrganizerInfoStoryState = 'ready' | 'loading' | 'restricted' | 'error' | 'invalid-route';
type DownloadOutcome = 'success' | 'error';

interface OrganizerInfoStoryArgs extends PublicEventStoryControls {
  state: OrganizerInfoStoryState;
  targetType: EventTargetType;
  eventCount: number;
  subscriberBaseCount: number;
  attendanceBaseCount: number;
  includeOnlineAttendanceCode: boolean;
  canDownloadSubscriberList: boolean;
  downloadOutcome: DownloadOutcome;
}

const defaultArgs: OrganizerInfoStoryArgs = {
  ...publicEventStoryDefaultControls,
  state: 'ready',
  targetType: 'event',
  eventCount: 2,
  subscriberBaseCount: 32,
  attendanceBaseCount: 24,
  includeOnlineAttendanceCode: true,
  canDownloadSubscriberList: true,
  downloadOutcome: 'success',
};

const navigateRouteError = fn(async () => true);

const withOrganizerInfoProviders: Decorator<OrganizerInfoStoryArgs> = (story, context) => {
  const args = { ...defaultArgs, ...context.args };
  return applicationConfig({
    providers: [
      provideRouter([]),
      provideNoopAnimations(),
      { provide: PLATFORM_ID, useValue: 'browser' },
      { provide: RouteErrorService, useValue: { navigate: navigateRouteError } },
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(
            convertToParamMap({
              eventType: args.state === 'invalid-route' ? 'invalid' : args.targetType,
              eventId: args.state === 'invalid-route' ? '' : 'organizer-story-target',
            }),
          ),
        },
      },
      {
        provide: AttendancesApiService,
        useValue: createAttendancesApiMock(args),
      },
      {
        provide: CertificateFileDownloadService,
        useValue: {
          save: () => undefined,
        },
      },
    ],
  })(story, context);
};

const meta: Meta<OrganizerInfoStoryArgs> = {
  component: OrganizerInfoComponent,
  title: 'Public/Profile/Attendance History/Organizer',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    ...publicEventStoryControlArgTypes,
    state: {
      control: 'select',
      options: ['ready', 'loading', 'restricted', 'error', 'invalid-route'],
    },
    targetType: {
      control: 'select',
      options: ['event', 'event-group', 'major-event'],
    },
    eventCount: { control: { type: 'range', min: 0, max: 5, step: 1 } },
    subscriberBaseCount: { control: { type: 'range', min: 0, max: 250, step: 1 } },
    attendanceBaseCount: { control: { type: 'range', min: 0, max: 250, step: 1 } },
    includeOnlineAttendanceCode: { control: 'boolean' },
    canDownloadSubscriberList: { control: 'boolean' },
    downloadOutcome: {
      control: 'select',
      options: ['success', 'error'],
    },
  },
  decorators: [
    withScenarioControls<OrganizerInfoStoryArgs>(),
    withOrganizerInfoProviders,
  ],
  beforeEach: () => {
    navigateRouteError.mockClear();
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<OrganizerInfoStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Informações do organizador')).toBeVisible();
    await expect(await canvas.findByText('Perfil público de ministrante')).toBeVisible();
    const downloadButtons = await canvas.findAllByRole('button', { name: /baixar lista de inscritos/i });
    await expect(downloadButtons).toHaveLength(2);
    await userEvent.hover(downloadButtons[0]);
    await expect(downloadButtons[0]).toBeVisible();
  },
};

export const MajorEventWithManyEvents: Story = {
  args: {
    targetType: 'major-event',
    eventCount: 5,
    name: 'Trilha de Carreira e Comunidade',
  },
};

export const EmptyEvents: Story = {
  args: {
    eventCount: 0,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Eventos')).toBeVisible();
    await expect(canvas.queryByText(/inscritos e/i)).toBeNull();
  },
};

export const WithoutDownloads: Story = {
  args: {
    includeOnlineAttendanceCode: false,
    canDownloadSubscriberList: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findAllByText('Sem código de presença on-line.')).toHaveLength(2);
    await expect(canvas.queryByRole('button', { name: /baixar lista de inscritos/i })).toBeNull();
  },
};

export const DownloadError: Story = {
  args: {
    downloadOutcome: 'error',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const downloadButtons = await canvas.findAllByRole('button', { name: /baixar lista de inscritos/i });
    await userEvent.click(downloadButtons[0]);
    await expect(await screen.findByText('Não foi possível baixar a lista de inscritos.')).toBeVisible();
  },
};

export const Restricted: Story = {
  args: {
    state: 'restricted',
  },
  play: async () => {
    await waitFor(() => expect(navigateRouteError).toHaveBeenCalledWith(404));
  },
};

export const Loading: Story = {
  args: {
    state: 'loading',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('progressbar')).toBeVisible();
  },
};

export const RequestError: Story = {
  args: {
    state: 'error',
  },
  play: async () => {
    await waitFor(() => expect(navigateRouteError).toHaveBeenCalledWith(500));
  },
};

export const InvalidRoute: Story = {
  args: {
    state: 'invalid-route',
  },
  play: async () => {
    await waitFor(() => expect(navigateRouteError).toHaveBeenCalledWith(404));
  },
};

function createAttendancesApiMock(
  args: OrganizerInfoStoryArgs,
): Pick<AttendancesApiService, 'getOrganizerInfo' | 'getOrganizerInfoStrict' | 'downloadEventSubscriberList'> {
  const getOrganizerInfo = () => {
    if (args.state === 'loading') {
      return NEVER;
    }

    if (args.state === 'restricted') {
      return of(null);
    }

    if (args.state === 'error') {
      return throwError(() => new Error('Não foi possível carregar as informações do organizador.'));
    }

    return of(buildOrganizerInfo(args));
  };

  return {
    getOrganizerInfo,
    getOrganizerInfoStrict: getOrganizerInfo,
    downloadEventSubscriberList: () => {
      if (args.downloadOutcome === 'error') {
        return throwError(() => new Error('Não foi possível baixar a lista de inscritos.'));
      }

      return of({
        fileName: 'inscritos-storybook.csv',
        mimeType: 'text/csv',
        contentBase64: 'bm9tZSxlbWFpbAo=',
      });
    },
  };
}

function buildOrganizerInfo(args: OrganizerInfoStoryArgs): OrganizerInfo {
  return {
    targetType: args.targetType,
    targetId: 'organizer-story-target',
    title: targetTitle(args),
    events: buildOrganizerEvents(args),
  };
}

function buildOrganizerEvents(args: OrganizerInfoStoryArgs): OrganizerEventInfo[] {
  const count = Math.min(Math.max(Math.trunc(args.eventCount), 0), 5);

  return Array.from({ length: count }, (_, index) => ({
    event: createPublicStoryEventFromControls(args, {
      id: `organizer-event-${index + 1}`,
      index,
      name: index === 0 ? args.name : undefined,
      dayOffset: args.dayOffset + index,
      startHour: args.startHour + index,
    }),
    subscriberCount: Math.max(args.subscriberBaseCount - index * 3, 0),
    attendanceCount: Math.max(args.attendanceBaseCount - index * 2, 0),
    onlineAttendanceCode: args.includeOnlineAttendanceCode ? `CACIC-${index + 1}42` : null,
    canDownloadSubscriberList: args.canDownloadSubscriberList,
  }));
}

function targetTitle(args: OrganizerInfoStoryArgs): string {
  if (args.targetType === 'major-event') {
    return args.majorEventName;
  }

  if (args.targetType === 'event-group') {
    return args.eventGroupName;
  }

  return args.name;
}
