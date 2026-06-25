import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { NEVER, of } from 'rxjs';
import { AuthService, ScannerFeedbackService } from '@cacic-fct/shared-angular';
import { AttendanceOfflineQueueService } from '@cacic-fct/offline-public-data-access';
import { AttendanceCollectionApiService } from './attendance-collection-api.service';
import { AttendanceScanner } from './attendance-scanner';
import { AttendanceOfflineSyncService } from './attendance-offline-sync.service';
import { NetworkStatusService } from '../../shared/network-status.service';

Object.defineProperty(globalThis.navigator, 'geolocation', {
  configurable: true,
  value: {
    getCurrentPosition: (success: PositionCallback) => {
      success({
        coords: {
          latitude: -22.1211,
          longitude: -51.4086,
          accuracy: 12,
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

const now = new Date();
const eventStart = new Date(now.getTime() + 20 * 60_000);
const eventEnd = new Date(eventStart.getTime() + 2 * 60 * 60_000);

const meta: Meta<AttendanceScanner> = {
  component: AttendanceScanner,
  title: 'Public/Attendance/Attendance Scanner',
  tags: ['autodocs'],
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
            isOnline: () => true,
          },
        },
        {
          provide: AttendanceOfflineQueueService,
          useValue: {
            replaceCollectionEvents: () => Promise.resolve(),
            getCollectionEvent: () => Promise.resolve(null),
            watchEventItems: () => of([]),
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
              of([
                {
                  eventId: 'event-open',
                  event: {
                    id: 'event-open',
                    name: 'Credenciamento',
                    startDate: eventStart.toISOString(),
                    endDate: eventEnd.toISOString(),
                    emoji: '✅',
                    type: 'OTHER',
                    locationDescription: 'Auditório',
                    shouldCollectAttendance: true,
                    publiclyVisible: true,
                    queueCount: 0,
                  },
                },
              ]),
            listFeed: () =>
              of([
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
                },
              ]),
            watchFeed: () => NEVER,
            registerScannerCode: () => of({}),
            registerManual: () => of({}),
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

type Story = StoryObj<AttendanceScanner>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Credenciamento')).toBeVisible();
    await expect(canvas.getByText('Ana Beatriz Silva')).toBeVisible();
    await expect(canvas.getByText('Carlos Eduardo Lima')).toBeVisible();
  },
};
