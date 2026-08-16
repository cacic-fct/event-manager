import { provideRouter } from '@angular/router';
import { fakerPT_BR as faker } from '@faker-js/faker';
import { AttendanceOfflineQueueService } from '@cacic-fct/public-indexed-db';
import { AuthService } from '@cacic-fct/shared-angular';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { NEVER, of, throwError } from 'rxjs';
import { expect, within } from 'storybook/test';
import { createPublicStoryEvent } from '../../../testing/public-event-story-fixtures';
import { AttendanceCollectionApiService, type AttendanceCollectionEvent } from '../attendance-collection-api.service';
import { ScannerEventList } from './event-list-page';

type LoadMode = 'ready' | 'loading' | 'empty' | 'offline-cache';

interface ScannerEventListStoryArgs {
  loadMode: LoadMode;
  eventCount: number;
}

const defaultArgs: ScannerEventListStoryArgs = {
  loadMode: 'ready',
  eventCount: 4,
};

let activeArgs = defaultArgs;

function collectionEvents(): AttendanceCollectionEvent[] {
  faker.seed(20260813 + activeArgs.eventCount);
  const now = new Date();

  return Array.from({ length: activeArgs.eventCount }, (_, index) => {
    const startsAt = new Date(now.getTime() + (index === 0 ? 30 : index * 8 * 60) * 60_000);
    const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60_000);
    const baseEvent = createPublicStoryEvent({
      id: `collection-event-${index + 1}`,
      index,
      name:
        index === 0
          ? 'Credenciamento'
          : faker.helpers.arrayElement([
              'Oficina de acessibilidade',
              'Arquitetura Angular com Signals',
              'Observabilidade para APIs GraphQL',
              'Introdução à segurança ofensiva',
            ]),
      emoji: faker.helpers.arrayElement(['✅', '🧪', '🧠', '📡']),
      locationDescription: index % 3 === 2 ? null : `Sala ${index + 1}`,
    });
    const event = {
      ...baseEvent,
      locationDescription: index % 3 === 2 ? null : `Sala ${index + 1}`,
      startDate: startsAt.toISOString(),
      endDate: endsAt.toISOString(),
      shouldAllowOralAttendance: index % 2 === 1,
    };
    return { eventId: event.id, event };
  });
}

const meta: Meta<ScannerEventListStoryArgs> = {
  component: ScannerEventList,
  title: 'CACiC Eventos/Attendance/Collection/Event List',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    loadMode: {
      control: 'inline-radio',
      options: ['ready', 'loading', 'empty', 'offline-cache'],
      description: 'Origem e estado da lista autorizada para coleta.',
    },
    eventCount: {
      control: { type: 'range', min: 1, max: 12, step: 1 },
      description: 'Quantidade de eventos gerados deterministicamente.',
    },
  },
  render: (args) => {
    activeArgs = args;
    return { props: {} };
  },
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { user: () => ({ sub: 'collector-1' }) },
        },
        {
          provide: AttendanceOfflineQueueService,
          useValue: {
            replaceCollectionEvents: () => Promise.resolve(),
            getCollectionEvents: () => Promise.resolve(collectionEvents()),
          },
        },
        {
          provide: AttendanceCollectionApiService,
          useValue: {
            listCollectionEvents: () => {
              if (activeArgs.loadMode === 'loading') {
                return NEVER;
              }
              if (activeArgs.loadMode === 'offline-cache') {
                return throwError(() => new Error('Sem conexão com o servidor.'));
              }
              return of(activeArgs.loadMode === 'empty' ? [] : collectionEvents());
            },
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
type Story = StoryObj<ScannerEventListStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Credenciamento')).toBeVisible();
    await expect(canvas.getByLabelText('Coletar presença em Credenciamento')).toHaveAttribute('aria-disabled', 'false');
  },
};

export const ManyAuthorizedEvents: Story = {
  name: 'Muitos eventos autorizados',
  args: { eventCount: 12 },
};

export const Empty: Story = {
  name: 'Sem eventos autorizados',
  args: { loadMode: 'empty' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Nenhum evento disponível')).toBeVisible();
  },
};

export const OfflineCache: Story = {
  name: 'Cache off-line',
  args: { loadMode: 'offline-cache' },
  globals: { theme: 'dark', network: 'offline', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Credenciamento')).toBeVisible();
  },
};

export const Loading: Story = {
  args: { loadMode: 'loading' },
};
