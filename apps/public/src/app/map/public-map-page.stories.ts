import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import type { PublicMapEvent } from '@cacic-fct/event-manager-public-contracts';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { delay, HttpResponse, http } from 'msw';
import { expect, userEvent, within } from 'storybook/test';
import { PublicMapGeolocationService } from '../shared/map/public-map-geolocation.service';
import { PublicUserLocationLayerService } from '../shared/map/public-user-location-layer.service';
import { PublicMapCacheService } from './public-map-cache.service';
import { PublicMapPage } from './public-map-page';
import { PublicMapStateService } from './public-map-state.service';

type CoordinateLayout = 'spread' | 'nearby' | 'coincident';

interface PublicMapStoryControls {
  eventCount: number;
  mineCount: number;
  coordinateLayout: CoordinateLayout;
}

interface PublicMapStoryContext {
  args: PublicMapStoryControls;
}

class StoryMapCacheService {
  read(): null {
    return null;
  }

  write(): void {
    return undefined;
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
  readonly permission = signal<'prompt' | 'granted' | 'denied' | 'unsupported'>('prompt');
  readonly isRequesting = signal(false);
}

class StoryDeniedGeolocationService extends StoryGeolocationService {
  override readonly permission = signal<'denied'>('denied');
}

class StoryLocationLayerService {
  addToMap(): void {
    return undefined;
  }
  stopAndHide(): void {
    return undefined;
  }
  destroy(): void {
    return undefined;
  }
  async startAndCenter(): Promise<{ success: true }> {
    return { success: true };
  }
}

const defaultControls: PublicMapStoryControls = {
  eventCount: 6,
  mineCount: 2,
  coordinateLayout: 'spread',
};

const meta: Meta<PublicMapStoryControls> = {
  component: PublicMapPage,
  title: 'CACiC Eventos/Map/Page',
  tags: ['autodocs'],
  args: defaultControls,
  argTypes: {
    eventCount: {
      control: { type: 'range', min: 0, max: 30, step: 1 },
      description: 'Quantidade de eventos devolvida pela API.',
    },
    mineCount: {
      control: { type: 'range', min: 0, max: 10, step: 1 },
      description: 'Quantidade inicial de eventos associados ao usuário.',
    },
    coordinateLayout: {
      control: 'inline-radio',
      options: ['spread', 'nearby', 'coincident'],
      description: 'Distribuição espacial usada para exercitar agrupamento e sobreposição.',
    },
  },
  decorators: [
    applicationConfig({
      providers: [
        { provide: PublicMapCacheService, useClass: StoryMapCacheService },
        { provide: PublicMapStateService, useClass: StoryMapStateService },
        { provide: PublicMapGeolocationService, useClass: StoryGeolocationService },
        { provide: PublicUserLocationLayerService, useClass: StoryLocationLayerService },
      ],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
    viewport: { defaultViewport: 'desktop' },
  },
};

export default meta;

type Story = StoryObj<PublicMapStoryControls>;

const playgroundContext = createContext();
const clusterContext = createContext({ eventCount: 12, coordinateLayout: 'nearby' });
const coincidentContext = createContext({ eventCount: 8, coordinateLayout: 'coincident' });
const myEventsContext = createContext({ eventCount: 7, mineCount: 3, coordinateLayout: 'nearby' });
const deniedContext = createContext({ eventCount: 4 });

export const Playground: Story = {
  render: (args) => renderStory(args, playgroundContext),
  parameters: mapParameters(playgroundContext),
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole('heading', { name: 'Mapa de eventos' })).toBeVisible();
    await expect(await canvas.findByRole('region', { name: 'Mapa interativo de eventos' })).toBeVisible();
    await expect(await canvas.findByRole('button', { name: 'Evento 1' })).toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: 'Abrir utilitários do mapa' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Filtrar eventos' }));

    const dialog = within(document.body);
    await expect(await dialog.findByRole('heading', { name: 'Filtrar eventos' })).toBeVisible();
    await userEvent.click(dialog.getByRole('radio', { name: 'Eventos de hoje' }));
    await userEvent.click(dialog.getByRole('button', { name: 'Aplicar' }));
    await expect(await canvas.findByLabelText('Filtros ativos')).toHaveTextContent('1');
  },
};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post('/api/graphql', async ({ request }) => {
          const query = await graphQlQuery(request);
          if (query.includes('PublicMapEvents')) {
            await delay('infinite');
          }
          return HttpResponse.json({ data: { currentUserMapEventIds: [] } });
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByLabelText('Carregando eventos no mapa'),
    ).toBeVisible();
  },
};

export const ApiError: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post('/api/graphql', async ({ request }) => {
          const query = await graphQlQuery(request);
          return query.includes('PublicMapEvents')
            ? HttpResponse.json({ errors: [{ message: 'Falha controlada do mapa.' }] })
            : HttpResponse.json({ data: { currentUserMapEventIds: [] } });
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Não foi possível carregar o mapa de eventos. Tente novamente em instantes.'),
    ).toBeVisible();
  },
};

export const Empty: Story = {
  parameters: staticMapParameters([]),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Nenhum evento com localização disponível.'),
    ).toBeVisible();
  },
};

export const NearbyClusters: Story = {
  args: clusterContext.args,
  render: (args) => renderStory(args, clusterContext),
  parameters: mapParameters(clusterContext),
  play: async ({ canvasElement }) => {
    const events = await within(canvasElement).findAllByRole('button', { name: /^Evento / });
    await expect(events).toHaveLength(clusterContext.args.eventCount);
  },
};

export const CoincidentEvents: Story = {
  args: coincidentContext.args,
  render: (args) => renderStory(args, coincidentContext),
  parameters: mapParameters(coincidentContext),
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const events = await within(canvasElement).findAllByRole('button', { name: /^Evento / });
    await expect(events).toHaveLength(coincidentContext.args.eventCount);
  },
};

export const MyEvents: Story = {
  args: myEventsContext.args,
  render: (args) => renderStory(args, myEventsContext),
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: mapRoute({ participacao: 'meus' }),
        },
      ],
    }),
  ],
  parameters: mapParameters(myEventsContext),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByLabelText('Filtros ativos')).toHaveTextContent('1');
    const events = await canvas.findAllByRole('button', { name: /^Evento / });
    await expect(events).toHaveLength(myEventsContext.args.mineCount);
  },
};

export const LocationDenied: Story = {
  args: deniedContext.args,
  render: (args) => renderStory(args, deniedContext),
  decorators: [
    applicationConfig({
      providers: [
        { provide: PublicMapGeolocationService, useClass: StoryDeniedGeolocationService },
      ],
    }),
  ],
  parameters: mapParameters(deniedContext),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Abrir utilitários do mapa' }));
    const locationButton = await canvas.findByRole('button', { name: 'Usar minha localização' });
    await expect(locationButton).toHaveAttribute('aria-disabled', 'true');
    await expect(locationButton).toHaveTextContent('location_disabled');
    await userEvent.click(locationButton);
    await expect(
      await within(document.body).findByText(
        'A localização está bloqueada. Libere a permissão nas configurações do navegador.',
      ),
    ).toBeVisible();
  },
};

function createContext(args: Partial<PublicMapStoryControls> = {}): PublicMapStoryContext {
  return { args: { ...defaultControls, ...args } };
}

function renderStory(args: PublicMapStoryControls, context: PublicMapStoryContext): { props: Record<string, never> } {
  context.args = { ...defaultControls, ...args };
  return { props: {} };
}

function mapParameters(context: PublicMapStoryContext) {
  return staticMapParameters(() => createEvents(context.args), () => mineIds(context.args));
}

function staticMapParameters(
  events: PublicMapEvent[] | (() => PublicMapEvent[]),
  currentUserEventIds: string[] | (() => string[]) = [],
) {
  return {
    msw: {
      handlers: [
        http.post('/api/graphql', async ({ request }) => {
          const query = await graphQlQuery(request);
          if (query.includes('CurrentUserMapEventIds')) {
            return HttpResponse.json({
              data: {
                currentUserMapEventIds:
                  typeof currentUserEventIds === 'function' ? currentUserEventIds() : currentUserEventIds,
              },
            });
          }
          if (query.includes('PublicMapEvents')) {
            return HttpResponse.json({
              data: { publicMapEvents: typeof events === 'function' ? events() : events },
            });
          }
          return HttpResponse.json({ data: {} });
        }),
      ],
    },
  };
}

async function graphQlQuery(request: Request): Promise<string> {
  const body = (await request.json()) as { query?: unknown };
  return typeof body.query === 'string' ? body.query : '';
}

function mineIds(controls: PublicMapStoryControls): string[] {
  return Array.from({ length: Math.min(controls.eventCount, controls.mineCount) }, (_, index) => `event-${index + 1}`);
}

function createEvents(controls: PublicMapStoryControls): PublicMapEvent[] {
  const now = new Date();
  return Array.from({ length: controls.eventCount }, (_, index) => {
    const start = new Date(now);
    start.setHours(9 + (index % 8), 0, 0, 0);
    start.setDate(now.getDate() + (index % 3));
    const end = new Date(start.getTime() + 90 * 60 * 1000);
    const [longitude, latitude] = storyCoordinates(index, controls.coordinateLayout);
    return {
      id: `event-${index + 1}`,
      name: `Evento ${index + 1}`,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      emoji: ['🎓', '🧠', '♿', '🎨'][index % 4] ?? '📍',
      longitude,
      latitude,
      locationDescription: `Espaço ${index + 1}`,
    };
  });
}

function storyCoordinates(index: number, layout: CoordinateLayout): [number, number] {
  if (layout === 'coincident') {
    return [-51.40775, -22.12103];
  }
  if (layout === 'nearby') {
    return [-51.40775 + (index % 4) * 0.00004, -22.12103 + Math.floor(index / 4) * 0.00004];
  }
  const angle = (index * Math.PI) / 3;
  const ring = 0.008 + Math.floor(index / 6) * 0.004;
  return [-51.40775 + Math.cos(angle) * ring, -22.12103 + Math.sin(angle) * ring];
}

function mapRoute(query: Record<string, string> = {}) {
  return {
    snapshot: {
      paramMap: convertToParamMap({}),
      queryParamMap: convertToParamMap(query),
    },
  };
}
