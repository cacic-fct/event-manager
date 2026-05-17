import { provideRouter } from '@angular/router';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { of } from 'rxjs';
import { AttendanceCollectionApiService } from './attendance-collection-api.service';
import { ScannerEventList } from './scanner-event-list';

const now = new Date();
const openStart = new Date(now.getTime() + 30 * 60_000);
const closedStart = new Date(now.getTime() + 8 * 60 * 60_000);

const meta: Meta<ScannerEventList> = {
  component: ScannerEventList,
  title: 'Public/Attendance/Scanner Event List',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
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
                    startDate: openStart.toISOString(),
                    endDate: new Date(openStart.getTime() + 2 * 60 * 60_000).toISOString(),
                    emoji: '✅',
                    type: 'OTHER',
                    locationDescription: 'Hall principal',
                    shouldCollectAttendance: true,
                    publiclyVisible: true,
                    queueCount: 0,
                  },
                },
                {
                  eventId: 'event-later',
                  event: {
                    id: 'event-later',
                    name: 'Oficina da tarde',
                    startDate: closedStart.toISOString(),
                    endDate: new Date(closedStart.getTime() + 2 * 60 * 60_000).toISOString(),
                    emoji: '🧪',
                    type: 'MINICURSO',
                    locationDescription: 'Laboratório 3',
                    shouldCollectAttendance: true,
                    publiclyVisible: true,
                    queueCount: 0,
                  },
                },
              ]),
          },
        },
      ],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
  beforeEach: () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: {
              latitude: -22.12,
              longitude: -51.4,
              accuracy: 12,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          } as GeolocationPosition),
      },
    });
  },
};

export default meta;

type Story = StoryObj<ScannerEventList>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Credenciamento')).toBeVisible();
    await expect(canvas.getByText('Oficina da tarde')).toBeVisible();
  },
};
