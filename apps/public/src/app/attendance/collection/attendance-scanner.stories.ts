import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { fakerPT_BR as faker } from '@faker-js/faker';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { NEVER, of, throwError } from 'rxjs';
import { AuthService, ScannerFeedbackService } from '@cacic-fct/shared-angular';
import { AttendanceOfflineQueueService, OfflineAttendanceQueueItem } from '@cacic-fct/offline-public-data-access';
import { AttendanceCollectionAccessService } from './attendance-collection-access.service';
import {
  AttendanceCollectionApiService,
  AttendanceCollectionEvent,
  AttendanceCollectionLocation,
  AttendanceScannerFeedItem,
} from './attendance-collection-api.service';
import { AttendanceScanner } from './attendance-scanner';
import { AttendanceOfflineSyncService } from './attendance-offline-sync.service';
import { NetworkStatusService } from '../../shared/network-status.service';

type QueueScenario = 'empty' | 'pending' | 'syncing' | 'failed' | 'review' | 'mixed';
type LocationScenario = 'precise' | 'imprecise' | 'denied';
type EventSourceScenario = 'online' | 'cached' | 'unavailable';
type FeedScenario = 'recent' | 'empty';

type AttendanceScannerStoryArgs = {
  eventName: string;
  networkOnline: boolean;
  eventSource: EventSourceScenario;
  locationState: LocationScenario;
  queueScenario: QueueScenario;
  feedScenario: FeedScenario;
  queueCount: number;
};

const now = new Date();
const eventStart = new Date(now.getTime() + 20 * 60_000);
const eventEnd = new Date(eventStart.getTime() + 2 * 60 * 60_000);

const defaultArgs: AttendanceScannerStoryArgs = {
  eventName: 'Credenciamento',
  networkOnline: true,
  eventSource: 'online',
  locationState: 'precise',
  queueScenario: 'empty',
  feedScenario: 'recent',
  queueCount: 3,
};

let activeArgs = defaultArgs;

const preciseLocation: AttendanceCollectionLocation = {
  latitude: -22.1211,
  longitude: -51.4086,
  accuracyMeters: 12,
};

Object.defineProperty(globalThis.navigator, 'geolocation', {
  configurable: true,
  value: {
    getCurrentPosition: (success: PositionCallback) => {
      success({
        coords: {
          latitude: preciseLocation.latitude,
          longitude: preciseLocation.longitude,
          accuracy: preciseLocation.accuracyMeters,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      } as GeolocationPosition);
    },
  },
});

const meta: Meta<AttendanceScannerStoryArgs> = {
  component: AttendanceScanner,
  title: 'Public/Attendance/Attendance Scanner',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    eventName: { control: 'text' },
    networkOnline: { control: 'boolean' },
    eventSource: { control: 'select', options: ['online', 'cached', 'unavailable'] },
    locationState: { control: 'select', options: ['precise', 'imprecise', 'denied'] },
    queueScenario: { control: 'select', options: ['empty', 'pending', 'syncing', 'failed', 'review', 'mixed'] },
    feedScenario: { control: 'select', options: ['recent', 'empty'] },
    queueCount: { control: { type: 'range', min: 1, max: 8, step: 1 }, if: { arg: 'queueScenario', neq: 'empty' } },
  },
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        ScannerFeedbackService,
        {
          provide: AuthService,
          useValue: {
            user: () => ({
              sub: 'collector-1',
              preferredUsername: 'Marina',
              email: 'marina@example.com',
              claims: { name: 'Marina Costa', email: 'marina@example.com' },
            }),
          },
        },
        {
          provide: NetworkStatusService,
          useValue: {
            isOnline: () => activeArgs.networkOnline,
          },
        },
        {
          provide: AttendanceCollectionAccessService,
          useValue: {
            getPreciseLocation: () => getLocation(activeArgs.locationState),
          },
        },
        {
          provide: AttendanceOfflineQueueService,
          useValue: {
            replaceCollectionEvents: () => Promise.resolve(),
            getCollectionEvent: () =>
              Promise.resolve(activeArgs.eventSource === 'cached' ? buildCollectionEvent(activeArgs) : null),
            watchEventItems: () => of(buildQueue(activeArgs)),
            retry: () => Promise.resolve(),
            remove: () => Promise.resolve(),
            enqueue: () => Promise.resolve(),
          },
        },
        {
          provide: AttendanceOfflineSyncService,
          useValue: {
            syncPending: () => Promise.resolve(),
            notifyPendingNow: () => Promise.resolve(),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ eventId: 'event-open' }),
            },
          },
        },
        {
          provide: AttendanceCollectionApiService,
          useValue: {
            listCollectionEvents: () =>
              activeArgs.eventSource === 'online'
                ? of([buildCollectionEvent(activeArgs)])
                : throwError(() => new Error('Rede indisponível no Storybook.')),
            listFeed: () => of(activeArgs.feedScenario === 'recent' ? buildFeed() : []),
            watchFeed: () => NEVER,
            registerScannerCode: () =>
              activeArgs.networkOnline
                ? of({
                    eventId: 'event-open',
                    personId: 'person-live',
                    attendedAt: new Date().toISOString(),
                    category: 'REGULAR',
                  })
                : throwError(() => new HttpErrorResponse({ status: 0, statusText: 'Offline' })),
            registerManual: () =>
              activeArgs.networkOnline
                ? of({
                    eventId: 'event-open',
                    personId: 'person-manual',
                    attendedAt: new Date().toISOString(),
                    category: 'REGULAR',
                  })
                : throwError(() => new HttpErrorResponse({ status: 0, statusText: 'Offline' })),
          },
        },
      ],
    }),
  ],
  render: (args) => {
    activeArgs = args;
    return { props: args };
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<AttendanceScannerStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(activeArgs.eventName)).toBeVisible();
  },
};

export const OfflineQueuePending: Story = {
  args: {
    networkOnline: false,
    queueScenario: 'pending',
    feedScenario: 'empty',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Sincronização off-line')).toBeVisible();
    await expect(await canvas.findByText(/para enviar/)).toBeVisible();
    await expect(await canvas.findByRole('button', { name: /sincronizar/i })).toBeVisible();
  },
};

export const QueueNeedsReview: Story = {
  args: {
    queueScenario: 'review',
    feedScenario: 'recent',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/conflito/i)).toBeVisible();
    await expect(await canvas.findByLabelText('Tentar novamente')).toBeVisible();
    await expect(await canvas.findByLabelText('Remover pendência')).toBeVisible();
  },
};

export const CachedEventWithoutFeed: Story = {
  args: {
    eventSource: 'cached',
    networkOnline: false,
    feedScenario: 'empty',
    queueScenario: 'failed',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Nenhuma presença registrada')).toBeVisible();
    await expect(await canvas.findByText(/falhou/i)).toBeVisible();
  },
};

export const LocationDenied: Story = {
  args: {
    locationState: 'denied',
    queueScenario: 'empty',
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Permita o acesso à localização precisa para continuar.')).toBeVisible();
  },
};

function buildCollectionEvent(args: AttendanceScannerStoryArgs): AttendanceCollectionEvent {
  return {
    eventId: 'event-open',
    event: {
      id: 'event-open',
      name: args.eventName,
      startDate: eventStart.toISOString(),
      endDate: eventEnd.toISOString(),
      emoji: '✅',
      type: 'OTHER',
      locationDescription: 'Auditório',
      shouldCollectAttendance: true,
      publiclyVisible: true,
      queueCount: 0,
    },
  };
}

function buildFeed(): AttendanceScannerFeedItem[] {
  return [
    {
      personId: 'person-1',
      eventId: 'event-open',
      fullName: 'Ana Beatriz Silva',
      unespRole: 'aluno-graduacao',
      subscriptionStatus: 'CONFIRMED',
      attendedAt: new Date(now.getTime() - 2 * 60_000).toISOString(),
      createdByMethod: 'SCANNER',
      collectedByFirstName: 'Marina',
    },
    {
      personId: 'person-2',
      eventId: 'event-open',
      fullName: 'Carlos Eduardo Lima',
      unespRole: 'external',
      subscriptionStatus: null,
      attendedAt: new Date(now.getTime() - 8 * 60_000).toISOString(),
      createdByMethod: 'MANUAL_INPUT',
      collectedByFirstName: 'Marina',
      committedByFirstName: 'João',
    },
  ];
}

function buildQueue(args: AttendanceScannerStoryArgs): OfflineAttendanceQueueItem[] {
  if (args.queueScenario === 'empty') {
    return [];
  }

  faker.seed(20260625 + args.queueCount);
  const statuses = queueStatuses(args.queueScenario);

  return Array.from({ length: args.queueCount }, (_, index) => {
    const status = statuses[index % statuses.length];
    return {
      clientId: `queue-${index + 1}`,
      queuedByUserId: 'collector-1',
      eventId: 'event-open',
      eventName: args.eventName,
      createdByMethod: index % 2 === 0 ? 'SCANNER' : 'MANUAL_INPUT',
      code: index % 2 === 0 ? `user:${faker.string.uuid()}` : undefined,
      value: index % 2 === 0 ? undefined : faker.internet.email().toLocaleLowerCase('pt-BR'),
      location: preciseLocation,
      collectedAt: new Date(now.getTime() - (index + 1) * 7 * 60_000).toISOString(),
      queuedAt: now.getTime() - (index + 1) * 7 * 60_000,
      updatedAt: now.getTime() - index * 3 * 60_000,
      authorUserId: 'collector-1',
      authorName: faker.person.fullName(),
      authorEmail: faker.internet.email().toLocaleLowerCase('pt-BR'),
      status,
      attempts: status === 'PENDING' ? 0 : faker.number.int({ min: 1, max: 3 }),
      lastError: queueError(status),
    };
  });
}

function queueStatuses(scenario: Exclude<QueueScenario, 'empty'>): OfflineAttendanceQueueItem['status'][] {
  switch (scenario) {
    case 'pending':
      return ['PENDING'];
    case 'syncing':
      return ['SYNCING'];
    case 'failed':
      return ['FAILED'];
    case 'review':
      return ['CONFLICT', 'DUPLICATE', 'FORBIDDEN'];
    case 'mixed':
      return ['PENDING', 'SYNCING', 'FAILED', 'CONFLICT', 'DUPLICATE', 'FORBIDDEN'];
  }
}

function queueError(status: OfflineAttendanceQueueItem['status']): string | null {
  switch (status) {
    case 'FAILED':
      return 'Não foi possível enviar. Tente novamente quando a conexão estabilizar.';
    case 'CONFLICT':
      return 'A coleta precisa de revisão administrativa.';
    case 'DUPLICATE':
      return 'Presença já registrada no servidor.';
    case 'FORBIDDEN':
      return 'A autorização para coleta expirou antes da sincronização.';
    case 'PENDING':
    case 'SYNCING':
      return null;
  }
}

function getLocation(scenario: LocationScenario): Promise<AttendanceCollectionLocation> {
  switch (scenario) {
    case 'precise':
      return Promise.resolve(preciseLocation);
    case 'imprecise':
      return Promise.reject(new Error('Ative a localização precisa. O navegador informou precisão de 420 m.'));
    case 'denied':
      return Promise.reject(new Error('Permita o acesso à localização precisa para continuar.'));
  }
}
