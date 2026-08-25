import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import type { PublicMapEvent } from '@cacic-fct/event-manager-public-contracts';
import type OlMap from 'ol/Map';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { delay, HttpResponse, http } from 'msw';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type {
  PublicMapDeviceOrientation,
  PublicMapGeolocationError,
  PublicMapLocationPermission,
  PublicMapUserLocation,
} from '../shared/map/public-map-geolocation.service';
import { PublicMapGeolocationService } from '../shared/map/public-map-geolocation.service';
import { PublicMapCacheService } from './public-map-cache.service';
import { PublicMapPage } from './public-map-page';
import {
  createPublicMapStoryEvents,
  createPublicMapStoryMineIds,
  publicMapStoryCenter,
  type PublicMapCoordinateLayout,
} from './public-map-story.fixtures';
import { PublicMapStateService } from './public-map-state.service';

type ApiState = 'ready' | 'loading' | 'error' | 'offline';
type LocationState = 'hidden' | 'locating' | 'live' | 'denied' | 'unsupported' | 'error';

interface PublicMapStoryArgs {
  accuracyMeters: number;
  apiState: ApiState;
  centerLatitude: number;
  centerLongitude: number;
  coordinateLayout: PublicMapCoordinateLayout;
  eventCount: number;
  eventDurationMinutes: number;
  eventNamePrefix: string;
  firstEventDayOffset: number;
  headingDegrees: number;
  locationState: LocationState;
  mineCount: number;
  responseDelay: number;
  spreadRadiusMeters: number;
  userLatitude: number;
  userLongitude: number;
}

const defaultArgs: PublicMapStoryArgs = {
  accuracyMeters: 14,
  apiState: 'ready',
  centerLatitude: publicMapStoryCenter.latitude,
  centerLongitude: publicMapStoryCenter.longitude,
  coordinateLayout: 'spread',
  eventCount: 8,
  eventDurationMinutes: 90,
  eventNamePrefix: '',
  firstEventDayOffset: 0,
  headingDegrees: 35,
  locationState: 'hidden',
  mineCount: 3,
  responseDelay: 80,
  spreadRadiusMeters: 720,
  userLatitude: publicMapStoryCenter.latitude + 0.00025,
  userLongitude: publicMapStoryCenter.longitude - 0.00018,
};

let activeArgs = defaultArgs;

class StoryMapCacheService {
  read<T>(): T | null {
    return null;
  }

  write(): void {
    return undefined;
  }

  writeEvents(): void {
    return undefined;
  }

  writeUserEventIds(): void {
    return undefined;
  }

  readOfflineEvents(): Promise<PublicMapEvent[] | null> {
    return Promise.resolve(activeArgs.apiState === 'offline' ? createEvents(activeArgs) : null);
  }

  readOfflineUserEventIds(): Promise<string[] | null> {
    return Promise.resolve(activeArgs.apiState === 'offline' ? mineIds(activeArgs) : null);
  }

  invalidate(): void {
    return undefined;
  }
}

class StoryMapStateService {
  read(): null {
    return null;
  }

  write(): void {
    return undefined;
  }
}

class StoryGeolocationService {
  readonly permission;
  readonly orientationPermission = signal<PublicMapLocationPermission>('granted');
  readonly location = signal<PublicMapUserLocation | null>(null);
  readonly orientation = signal<PublicMapDeviceOrientation | null>(null);
  readonly error;
  readonly isRequesting;
  readonly isTracking = signal(false);
  readonly isTrackingOrientation = signal(false);
  readonly isSupported;

  constructor(private readonly storyArgs: PublicMapStoryArgs) {
    this.permission = signal<PublicMapLocationPermission>(locationPermission(storyArgs.locationState));
    this.error = signal<PublicMapGeolocationError | null>(locationError(storyArgs.locationState));
    this.isRequesting = signal(storyArgs.locationState === 'locating');
    this.isSupported = signal(storyArgs.locationState !== 'unsupported');
  }

  async requestLocation(): Promise<PublicMapUserLocation | null> {
    if (this.storyArgs.locationState === 'denied' || this.storyArgs.locationState === 'unsupported') {
      return null;
    }
    if (this.storyArgs.locationState === 'error') {
      this.error.set(locationError('error'));
      return null;
    }
    const location = storyLocation(this.storyArgs);
    this.permission.set('granted');
    this.location.set(location);
    return location;
  }

  async startTracking(): Promise<boolean> {
    if (this.storyArgs.locationState === 'locating') {
      this.isRequesting.set(true);
      return new Promise<boolean>(() => undefined);
    }
    const location = await this.requestLocation();
    if (!location) {
      return false;
    }
    this.isRequesting.set(false);
    this.isTracking.set(true);
    this.isTrackingOrientation.set(true);
    this.orientation.set({
      heading: this.storyArgs.headingDegrees,
      absolute: true,
      timestamp: Date.now(),
    });
    return true;
  }

  stopTracking(): void {
    this.isTracking.set(false);
    this.isTrackingOrientation.set(false);
  }

  destroy(): void {
    this.stopTracking();
  }
}

const mapGraphqlHandler = http.post('/api/graphql', async ({ request }) => {
  const query = await graphQlQuery(request);
  if (query.includes('CurrentUserMapEventIds')) {
    if (activeArgs.apiState === 'offline') {
      return HttpResponse.json({ errors: [{ message: 'Sem conexão para consultar participações.' }] });
    }
    return HttpResponse.json({ data: { currentUserMapEventIds: mineIds(activeArgs) } });
  }
  if (!query.includes('PublicMapEvents')) {
    return HttpResponse.json({ data: {} });
  }
  if (activeArgs.apiState === 'loading') {
    await delay('infinite');
  }
  if (activeArgs.apiState === 'error' || activeArgs.apiState === 'offline') {
    return HttpResponse.json({ errors: [{ message: 'Falha controlada do mapa.' }] });
  }
  if (activeArgs.responseDelay > 0) {
    await delay(activeArgs.responseDelay);
  }
  return HttpResponse.json({ data: { publicMapEvents: createEvents(activeArgs) } });
});

const meta: Meta<PublicMapStoryArgs> = {
  component: PublicMapPage,
  title: 'CACiC Eventos/Map/Page',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    apiState: { control: 'inline-radio', options: ['ready', 'loading', 'error', 'offline'] },
    eventCount: { control: { type: 'range', min: 0, max: 60, step: 1 } },
    eventNamePrefix: { control: 'text' },
    eventDurationMinutes: { control: { type: 'range', min: 15, max: 480, step: 15 } },
    firstEventDayOffset: { control: { type: 'range', min: -7, max: 30, step: 1 } },
    mineCount: { control: { type: 'range', min: 0, max: 30, step: 1 } },
    coordinateLayout: { control: 'inline-radio', options: ['spread', 'nearby', 'coincident'] },
    spreadRadiusMeters: { control: { type: 'range', min: 1, max: 5_000, step: 10 } },
    centerLatitude: { control: { type: 'number', min: -90, max: 90, step: 0.00001 } },
    centerLongitude: { control: { type: 'number', min: -180, max: 180, step: 0.00001 } },
    responseDelay: { control: { type: 'range', min: 0, max: 3_000, step: 100 } },
    locationState: {
      control: 'select',
      options: ['hidden', 'locating', 'live', 'denied', 'unsupported', 'error'],
    },
    userLatitude: { control: { type: 'number', min: -90, max: 90, step: 0.00001 } },
    userLongitude: { control: { type: 'number', min: -180, max: 180, step: 0.00001 } },
    accuracyMeters: { control: { type: 'range', min: 1, max: 500, step: 1 } },
    headingDegrees: { control: { type: 'range', min: 0, max: 359, step: 1 } },
  },
  render: (args) => {
    activeArgs = { ...defaultArgs, ...args };
    return { props: {} };
  },
  decorators: [
    (story, context) =>
      applicationConfig({
        providers: [
          { provide: PublicMapCacheService, useClass: StoryMapCacheService },
          { provide: PublicMapStateService, useClass: StoryMapStateService },
          {
            provide: PublicMapGeolocationService,
            useFactory: () => new StoryGeolocationService({ ...defaultArgs, ...context.args }),
          },
        ],
      })(story, context),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
    viewport: { defaultViewport: 'desktop' },
    msw: { handlers: { graphql: [mapGraphqlHandler] } },
  },
};

export default meta;
type Story = StoryObj<PublicMapStoryArgs>;

export const Playground: Story = {
  play: async ({ args, canvasElement }) => {
    await expectReadyMap(canvasElement, args.eventCount);
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Abrir utilitários do mapa' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Filtrar eventos' }));
    const dialog = within(document.body);
    await userEvent.click(await dialog.findByRole('radio', { name: 'Eventos de hoje' }));
    await userEvent.click(dialog.getByRole('button', { name: 'Aplicar' }));
    await expect(await canvas.findByLabelText('Filtros ativos')).toHaveTextContent('1');
  },
};

export const NearbyClusters: Story = {
  name: 'Agrupamentos próximos',
  args: { coordinateLayout: 'nearby', eventCount: 18, spreadRadiusMeters: 12 },
  play: async ({ args, canvasElement }) => {
    await expectReadyMap(canvasElement, args.eventCount);
    await expectClusterWithAtLeast(2);
  },
};

export const CoincidentEvents: Story = {
  name: 'Eventos na mesma coordenada',
  args: { coordinateLayout: 'coincident', eventCount: 8 },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ args, canvasElement }) => {
    await expectReadyMap(canvasElement, args.eventCount);
    await expectClusterWithAtLeast(args.eventCount);
  },
};

export const LiveLocation: Story = {
  name: 'Localização ao vivo com precisão e direção',
  args: { locationState: 'live', coordinateLayout: 'nearby', eventCount: 12, spreadRadiusMeters: 16 },
  play: async ({ canvasElement }) => {
    await expectReadyMap(canvasElement, 12);
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Abrir utilitários do mapa' }));
    const locationButton = await canvas.findByRole('button', { name: 'Usar minha localização' });
    await expect(locationButton).not.toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(locationButton);
    await expectLocationFeatures([
      'public-user-location-dot',
      'public-user-location-accuracy',
      'public-user-location-direction',
    ]);
  },
};

export const Locating: Story = {
  name: 'Localização em andamento',
  args: { locationState: 'locating' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expectReadyMap(canvasElement, defaultArgs.eventCount);
    await userEvent.click(canvas.getByRole('button', { name: 'Abrir utilitários do mapa' }));
    await expect(await canvas.findByRole('button', { name: 'Usar minha localização' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  },
};

export const LocationDenied: Story = {
  name: 'Permissão de localização bloqueada',
  args: { locationState: 'denied' },
  play: async ({ canvasElement }) => {
    await expectLocationUnavailable(
      canvasElement,
      'A localização está bloqueada. Libere a permissão nas configurações do navegador.',
    );
  },
};

export const LocationUnsupported: Story = {
  name: 'Localização não suportada',
  args: { locationState: 'unsupported' },
  play: async ({ canvasElement }) => {
    await expectLocationUnavailable(canvasElement, 'Este navegador não oferece localização para o mapa.');
  },
};

export const LocationError: Story = {
  name: 'Falha recuperável de localização',
  args: { locationState: 'error' },
  play: async ({ canvasElement }) => {
    await expectReadyMap(canvasElement, defaultArgs.eventCount);
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Abrir utilitários do mapa' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Usar minha localização' }));
    await expect(
      await within(document.body).findByText('Não foi possível determinar a localização simulada.'),
    ).toBeVisible();
  },
};

export const MyEvents: Story = {
  name: 'Somente meus eventos',
  args: { coordinateLayout: 'nearby', eventCount: 10, mineCount: 4, spreadRadiusMeters: 16 },
  decorators: [
    applicationConfig({ providers: [{ provide: ActivatedRoute, useValue: mapRoute({ participacao: 'meus' }) }] }),
  ],
  play: async ({ args, canvasElement }) => {
    await expectReadyMap(canvasElement, args.mineCount);
    await expect(await within(canvasElement).findByLabelText('Filtros ativos')).toHaveTextContent('1');
  },
};

export const DeepLinkedEvent: Story = {
  name: 'Evento destacado por link',
  decorators: [
    applicationConfig({ providers: [{ provide: ActivatedRoute, useValue: mapRoute({ evento: 'map-event-2' }) }] }),
  ],
  play: async ({ args, canvasElement }) => expectReadyMap(canvasElement, args.eventCount),
};

export const OfflineCache: Story = {
  name: 'Mapa salvo sem conexão',
  args: { apiState: 'offline', coordinateLayout: 'nearby', eventCount: 9, spreadRadiusMeters: 14 },
  globals: { network: 'offline' },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expectReadyMap(canvasElement, args.eventCount);
    await expect(
      await within(document.body).findByText(/dados exibidos no mapa podem estar desatualizados/i),
    ).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Você está off-line' })).toBeVisible();
  },
};

export const Loading: Story = {
  args: { apiState: 'loading' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByLabelText('Carregando eventos no mapa')).toBeVisible();
  },
};

export const ApiError: Story = {
  args: { apiState: 'error' },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(
        'Não foi possível carregar o mapa de eventos. Tente novamente em instantes.',
      ),
    ).toBeVisible();
  },
};

export const Empty: Story = {
  args: { eventCount: 0 },
  play: async () => {
    await expect(await within(document.body).findByText('Nenhum evento com localização disponível.')).toBeVisible();
  },
};

export const LongContentOnMobile: Story = {
  name: 'Conteúdo extenso no celular',
  args: {
    coordinateLayout: 'nearby',
    eventCount: 24,
    eventNamePrefix: 'Semana integrada de ciência, tecnologia, cultura e extensão universitária · ',
    spreadRadiusMeters: 18,
  },
  globals: { theme: 'dark', motion: 'reduced' },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  play: async ({ args, canvasElement }) => expectReadyMap(canvasElement, args.eventCount),
};

function createEvents(args: PublicMapStoryArgs): PublicMapEvent[] {
  return createPublicMapStoryEvents(args);
}

function mineIds(args: PublicMapStoryArgs): string[] {
  return createPublicMapStoryMineIds(args.eventCount, args.mineCount);
}

function storyLocation(args: PublicMapStoryArgs): PublicMapUserLocation {
  return {
    latitude: args.userLatitude,
    longitude: args.userLongitude,
    accuracy: args.accuracyMeters,
    altitude: 431,
    altitudeAccuracy: 8,
    heading: args.headingDegrees,
    speed: 1.2,
    timestamp: Date.now(),
  };
}

function locationPermission(state: LocationState): PublicMapLocationPermission {
  if (state === 'live') return 'granted';
  if (state === 'denied') return 'denied';
  if (state === 'unsupported') return 'unsupported';
  return 'prompt';
}

function locationError(state: LocationState): PublicMapGeolocationError | null {
  return state === 'error'
    ? { code: 'position-unavailable', message: 'Não foi possível determinar a localização simulada.' }
    : null;
}

async function expectReadyMap(canvasElement: HTMLElement, eventCount: number): Promise<void> {
  const canvas = within(canvasElement);
  await expect(await canvas.findByRole('heading', { name: 'Mapa de eventos' })).toBeVisible();
  await expect(await canvas.findByRole('region', { name: 'Mapa interativo de eventos' })).toBeVisible();
  const eventList = canvas.getByLabelText('Eventos visíveis no mapa');
  await waitFor(() => expect(eventList.querySelectorAll('button')).toHaveLength(eventCount));
  await waitFor(() => expect(canvasElement.querySelectorAll('.ol-layer canvas').length).toBeGreaterThan(0));
}

async function expectClusterWithAtLeast(memberCount: number): Promise<void> {
  await waitFor(() => {
    const sizes = clusterSizes();
    expect(sizes.some((size) => size >= memberCount)).toBe(true);
  });
}

function clusterSizes(): number[] {
  return mapLayers().flatMap((layer) => {
    const source = (
      layer as unknown as {
        getSource?: () => { getFeatures?: () => Array<{ get: (name: string) => unknown }> } | null;
      }
    ).getSource?.();
    return (source?.getFeatures?.() ?? []).flatMap((feature) => {
      const members = feature.get('features');
      return Array.isArray(members) ? [members.length] : [];
    });
  });
}

async function expectLocationFeatures(expectedIds: string[]): Promise<void> {
  await waitFor(() => {
    const featureIds = mapLayers().flatMap((layer) => {
      const source = (
        layer as unknown as {
          getSource?: () => { getFeatures?: () => Array<{ getId: () => string | number | undefined }> } | null;
        }
      ).getSource?.();
      return (source?.getFeatures?.() ?? []).map((feature) => String(feature.getId()));
    });
    expect(featureIds).toEqual(expect.arrayContaining(expectedIds));
  });
}

function mapLayers() {
  const map = (globalThis as typeof globalThis & { __eventMap?: OlMap }).__eventMap;
  return map?.getLayers().getArray() ?? [];
}

async function expectLocationUnavailable(canvasElement: HTMLElement, message: string): Promise<void> {
  await expectReadyMap(canvasElement, defaultArgs.eventCount);
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: 'Abrir utilitários do mapa' }));
  const locationButton = await canvas.findByRole('button', { name: 'Usar minha localização' });
  await expect(locationButton).toHaveTextContent('location_disabled');
  await userEvent.click(locationButton);
  await expect(await within(document.body).findByText(message)).toBeVisible();
}

async function graphQlQuery(request: Request): Promise<string> {
  const body = (await request.json()) as { query?: unknown };
  return typeof body.query === 'string' ? body.query : '';
}

function mapRoute(query: Record<string, string> = {}) {
  return {
    snapshot: {
      paramMap: convertToParamMap({}),
      queryParamMap: convertToParamMap(query),
    },
  };
}
