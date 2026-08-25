import { DEFAULT_MAP_CENTER } from '@cacic-fct/shared-utils';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, fn, waitFor } from 'storybook/test';
import { PublicMapTileCacheWarmupService } from '../../shared/map/public-map-tile-cache-warmup.service';
import { EventLocationMap } from './location-map';

interface EventLocationMapStoryArgs {
  latitude: number | null;
  longitude: number | null;
  title: string;
}

const warmLocation = fn(async () => undefined);
const defaultArgs: EventLocationMapStoryArgs = {
  latitude: DEFAULT_MAP_CENTER[1],
  longitude: DEFAULT_MAP_CENTER[0],
  title: 'FCT-Unesp',
};

const meta: Meta<EventLocationMapStoryArgs> = {
  component: EventLocationMap,
  title: 'CACiC Eventos/Events/Location Map',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    latitude: { control: { type: 'number', min: -90, max: 90, step: 0.00001 } },
    longitude: { control: { type: 'number', min: -180, max: 180, step: 0.00001 } },
    title: { control: 'text' },
  },
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: PublicMapTileCacheWarmupService,
          useValue: { warmLocation },
        },
      ],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
};

export default meta;
type Story = StoryObj<EventLocationMapStoryArgs>;

export const Playground: Story = {
  play: async ({ args, canvasElement }) => {
    await expectRenderedMap(canvasElement);
    await expect(warmLocation).toHaveBeenCalledWith(args.latitude, args.longitude);
  },
};

export const NearbyCampusBuilding: Story = {
  name: 'Outro ponto próximo no campus',
  args: {
    latitude: DEFAULT_MAP_CENTER[1] + 0.0011,
    longitude: DEFAULT_MAP_CENTER[0] - 0.0009,
    title: 'Auditório da FCT-Unesp',
  },
  play: async ({ canvasElement }) => expectRenderedMap(canvasElement),
};

export const EquatorAndPrimeMeridian: Story = {
  name: 'Coordenadas zero válidas',
  args: { latitude: 0, longitude: 0, title: 'Encontro entre o Equador e Greenwich' },
  play: async ({ canvasElement }) => expectRenderedMap(canvasElement),
};

export const LongLocationName: Story = {
  name: 'Nome de localização extenso',
  args: {
    title:
      'Faculdade de Ciências e Tecnologia da Universidade Estadual Paulista Júlio de Mesquita Filho · Campus de Presidente Prudente',
  },
  globals: { theme: 'dark', motion: 'reduced' },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  play: async ({ canvasElement }) => expectRenderedMap(canvasElement),
};

export const MissingCoordinates: Story = {
  args: { latitude: null, longitude: null, title: 'Local ainda não definido' },
  play: async ({ canvasElement }) => {
    const map = canvasElement.querySelector('.map-target');
    await expect(map).toBeInTheDocument();
    await expect(map).toBeEmptyDOMElement();
  },
};

export const PartialCoordinates: Story = {
  name: 'Coordenadas incompletas',
  args: { latitude: DEFAULT_MAP_CENTER[1], longitude: null, title: 'Longitude ausente' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.map-target')).toBeEmptyDOMElement();
  },
};

async function expectRenderedMap(canvasElement: HTMLElement): Promise<void> {
  await waitFor(() => expect(canvasElement.querySelectorAll('.ol-layer canvas').length).toBeGreaterThan(0));
  await expect(canvasElement.querySelector('.map-target')).not.toBeEmptyDOMElement();
}
