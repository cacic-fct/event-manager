import { fakerPT_BR as faker } from '@faker-js/faker';
import { HttpResponse, delay, http } from 'msw';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import type { PlacePreset } from '@cacic-fct/event-manager-admin-contracts';
import { createAdminPlacePreset } from '../testing/admin-entity-fixtures';
import { PlacesPageComponent } from './places-page.component';

faker.seed(20260616);

type PlacesTabStoryArgs = {
  placeCount: number;
  includeIncompletePlace: boolean;
  apiState: 'ready' | 'loading' | 'error';
  latencyMs: number;
  incompleteEvery: number;
  longNames: boolean;
};

let activeArgs: PlacesTabStoryArgs = {
  placeCount: 4,
  includeIncompletePlace: true,
  apiState: 'ready',
  latencyMs: 120,
  incompleteEvery: 0,
  longNames: false,
};

function placePreset(index: number, incomplete = false): PlacePreset {
  const names = ['Auditório Discente', 'Laboratório de Software', 'Anfiteatro Central', 'Sala B12', 'Bloco de Eventos'];

  return createAdminPlacePreset({
    id: `place-${index + 1}`,
    name: `${names[index % names.length]}${activeArgs.longNames ? ` · ${faker.company.catchPhrase()}` : ''}`,
    latitude: incomplete ? null : Number((-22.1211 + index * 0.001).toFixed(6)),
    longitude: incomplete ? null : Number((-51.4086 - index * 0.001).toFixed(6)),
    locationDescription: incomplete
      ? null
      : faker.helpers.arrayElement(['FCT-Unesp', 'Piso térreo', 'Próximo à secretaria']),
    createdAt: '2026-05-16T12:00:00.000Z',
    updatedAt: '2026-05-16T12:00:00.000Z',
    createdById: 'storybook-admin',
    updatedById: 'storybook-admin',
  });
}

function places(args: PlacesTabStoryArgs): PlacePreset[] {
  return Array.from({ length: Math.max(0, Math.min(30, Math.round(args.placeCount))) }, (_, index) =>
    placePreset(
      index,
      (args.includeIncompletePlace && index === args.placeCount - 1) ||
        (args.incompleteEvery > 0 && (index + 1) % Math.round(args.incompleteEvery) === 0),
    ),
  );
}

const meta: Meta<PlacesTabStoryArgs> = {
  component: PlacesPageComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Places/Workspace Places Tab',
  tags: ['autodocs'],
  args: activeArgs,
  argTypes: {
    placeCount: { control: { type: 'range', min: 0, max: 30, step: 1 } },
    includeIncompletePlace: { control: 'boolean' },
    apiState: { control: 'inline-radio', options: ['ready', 'loading', 'error'] },
    latencyMs: { control: { type: 'range', min: 0, max: 2_000, step: 100 } },
    incompleteEvery: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    longNames: { control: 'boolean' },
  },
  render: (args) => {
    activeArgs = args;
    faker.seed(20260616 + args.placeCount);
    return { props: args };
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
    msw: {
      handlers: {
        graphql: [
        http.post('/api/graphql', async ({ request }) => {
          if (activeArgs.apiState === 'loading') await delay('infinite');
          if (activeArgs.latencyMs > 0) await delay(activeArgs.latencyMs);
          const body = (await request.json()) as { query?: string; variables?: Record<string, unknown> };
          const query = body.query ?? '';
          if (activeArgs.apiState === 'error') {
            return HttpResponse.json({ errors: [{ message: 'Não foi possível carregar os locais.' }] });
          }
          const items = places(activeArgs);

          if (query.includes('ListPlacePresets')) {
            return HttpResponse.json({ data: { placePresets: items } });
          }

          if (query.includes('GetPlacePreset')) {
            return HttpResponse.json({ data: { placePreset: items[0] ?? placePreset(0) } });
          }

          if (query.includes('CreatePlacePreset')) {
            return HttpResponse.json({ data: { createPlacePreset: placePreset(99) } });
          }

          if (query.includes('UpdatePlacePreset')) {
            return HttpResponse.json({ data: { updatePlacePreset: items[0] ?? placePreset(0) } });
          }

          if (query.includes('DeletePlacePreset')) {
            return HttpResponse.json({ data: { deletePlacePreset: { deleted: true, id: 'place-1' } } });
          }

          if (query.includes('MergePlacePreset')) {
            return HttpResponse.json({ data: { mergePlacePreset: { deleted: true, id: 'place-2' } } });
          }

          return HttpResponse.json({ data: {} });
        }),
        ],
      },
    },
  },
};

export default meta;

type Story = StoryObj<PlacesTabStoryArgs>;

async function exerciseStory(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement);
  await expect(await canvas.findByText('Novo local')).toBeVisible();
  await userEvent.type(await canvas.findByLabelText(/buscar local/i), 'auditório');
}

export const Playground: Story = {
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const EmptyList: Story = {
  args: {
    placeCount: 0,
    includeIncompletePlace: false,
  },
};

export const DarkReducedMotion: Story = {
  ...EmptyList,
  globals: { theme: 'dark', motion: 'reduced' },
};

export const DensePlaces: Story = {
  args: { placeCount: 30, incompleteEvery: 4, includeIncompletePlace: false, latencyMs: 0 },
};

export const Loading: Story = {
  args: { apiState: 'loading', latencyMs: 0 },
};

export const LoadError: Story = {
  args: { apiState: 'error', latencyMs: 0 },
  globals: { theme: 'dark', motion: 'reduced' },
};

export const LongNamesMobile: Story = {
  args: { placeCount: 16, longNames: true, incompleteEvery: 3, latencyMs: 0 },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', motion: 'reduced' },
};
