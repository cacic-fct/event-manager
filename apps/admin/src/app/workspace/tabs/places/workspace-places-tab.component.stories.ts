import { fakerPT_BR as faker } from '@faker-js/faker';
import { HttpResponse, http } from 'msw';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import type { PlacePreset } from '@cacic-fct/event-manager-admin-contracts';
import { createAdminPlacePreset } from '../../../testing/admin-entity-fixtures';
import { WorkspacePlacesTabComponent } from './workspace-places-tab.component';

faker.seed(20260616);

type PlacesTabStoryArgs = {
  placeCount: number;
  includeIncompletePlace: boolean;
};

let activeArgs: PlacesTabStoryArgs = {
  placeCount: 4,
  includeIncompletePlace: true,
};

function placePreset(index: number, incomplete = false): PlacePreset {
  const names = ['Auditório Discente', 'Laboratório de Software', 'Anfiteatro Central', 'Sala B12', 'Bloco de Eventos'];

  return createAdminPlacePreset({
    id: `place-${index + 1}`,
    name: names[index % names.length],
    latitude: incomplete ? null : Number((-22.1211 + index * 0.001).toFixed(6)),
    longitude: incomplete ? null : Number((-51.4086 - index * 0.001).toFixed(6)),
    locationDescription: incomplete ? null : faker.helpers.arrayElement(['FCT-Unesp', 'Piso térreo', 'Próximo à secretaria']),
    createdAt: '2026-05-16T12:00:00.000Z',
    updatedAt: '2026-05-16T12:00:00.000Z',
    createdById: 'storybook-admin',
    updatedById: 'storybook-admin',
  });
}

function places(args: PlacesTabStoryArgs): PlacePreset[] {
  return Array.from({ length: args.placeCount }, (_, index) =>
    placePreset(index, args.includeIncompletePlace && index === args.placeCount - 1),
  );
}

const meta: Meta<PlacesTabStoryArgs> = {
  component: WorkspacePlacesTabComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Places/Workspace Places Tab',
  tags: ['autodocs'],
  args: activeArgs,
  argTypes: {
    placeCount: { control: { type: 'range', min: 0, max: 12, step: 1 } },
    includeIncompletePlace: { control: 'boolean' },
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
      handlers: [
        http.post('/api/graphql', async ({ request }) => {
          const body = (await request.json()) as { query?: string; variables?: Record<string, unknown> };
          const query = body.query ?? '';
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
