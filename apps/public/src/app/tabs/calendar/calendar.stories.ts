import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import { HttpResponse, http } from 'msw';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { Calendar } from './calendar';
import {
  CalendarStoryEventControls,
  calendarStoryEventControlArgTypes,
  calendarStoryEventDefaultControls,
  createCalendarStoryEvents,
} from './calendar-story-fixtures';

interface CalendarStoryContext {
  args: CalendarStoryEventControls;
}

const meta: Meta<CalendarStoryEventControls> = {
  component: Calendar,
  title: 'Public/Tabs/Calendar/Calendar',
  tags: ['autodocs'],
  args: calendarStoryEventDefaultControls,
  argTypes: calendarStoryEventControlArgTypes,
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<CalendarStoryEventControls>;

const onlineContext = createStoryContext();

const expectCalendarEventVisible = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const links = await canvas.findAllByRole('link');
  const firstLink = links[0];
  if (!firstLink) {
    throw new Error('Expected at least one calendar event link.');
  }

  await expect(firstLink).toBeVisible();
};

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await expectCalendarEventVisible(canvasElement);

  await expect(await canvas.findByText('Acessibilidade em produtos digitais')).toBeVisible();

  const searchInput = canvas.getByRole('searchbox', { name: 'Buscar eventos' });
  await userEvent.clear(searchInput);
  await userEvent.type(searchInput, 'sem resultado storybook');
  await userEvent.click(canvas.getByRole('button', { name: 'Buscar' }));
  await expect(await canvas.findByText('Nenhum evento encontrado.')).toBeVisible();
  await userEvent.clear(searchInput);
  await userEvent.click(canvas.getByRole('button', { name: 'Buscar' }));
  await expectCalendarEventVisible(canvasElement);

  await userEvent.click(await canvas.findByRole('button', { name: 'Visualização semanal' }));
  await expect(await canvas.findByRole('button', { name: 'Próxima semana' })).toBeVisible();
  await userEvent.click(await canvas.findByRole('button', { name: 'Ir para hoje' }));
  await expectCalendarEventVisible(canvasElement);
  await userEvent.click(await canvas.findByRole('button', { name: 'Visualização em lista' }));
  await expectCalendarEventVisible(canvasElement);
};

export const Online: Story = {
  render: (args) => renderStory(args, onlineContext),
  parameters: storyParameters(onlineContext),
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OfflineFallback: Story = {
  globals: { theme: 'light', network: 'offline' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Calendário')).toBeVisible();
  },
};

function createStoryContext(args: Partial<CalendarStoryEventControls> = {}): CalendarStoryContext {
  return {
    args: { ...calendarStoryEventDefaultControls, ...args },
  };
}

function renderStory(args: CalendarStoryEventControls, context: CalendarStoryContext) {
  context.args = { ...calendarStoryEventDefaultControls, ...args };
  return { props: {} };
}

function storyParameters(context: CalendarStoryContext) {
  return {
    msw: {
      handlers: [
        http.post('/api/graphql', async ({ request }) => {
          const body = (await request.json()) as { query?: string; variables?: Record<string, unknown> };
          if (!body.query?.includes('publicCalendarEvents')) {
            return HttpResponse.json({ data: {} });
          }

          return HttpResponse.json({
            data: {
              publicCalendarEvents: filterCalendarEvents(createCalendarStoryEvents(context.args), body.variables ?? {}),
            },
          });
        }),
      ],
    },
  };
}

function filterCalendarEvents(events: PublicEvent[], variables: Record<string, unknown>): PublicEvent[] {
  const query = String(variables['query'] ?? '').trim().toLocaleLowerCase('pt-BR');
  const eventType = variables['eventType'];
  const startDateFrom = parseOptionalDate(variables['startDateFrom']);
  const startDateUntil = parseOptionalDate(variables['startDateUntil']);

  return events.filter((event) => {
    const startDate = Date.parse(event.startDate);
    const matchesStart = startDateFrom === null || startDate >= startDateFrom;
    const matchesEnd = startDateUntil === null || startDate <= startDateUntil;
    const matchesType = typeof eventType !== 'string' || event.type === eventType;
    const matchesQuery =
      !query ||
      event.name.toLocaleLowerCase('pt-BR').includes(query) ||
      (event.shortDescription ?? '').toLocaleLowerCase('pt-BR').includes(query) ||
      (event.majorEvent?.name ?? '').toLocaleLowerCase('pt-BR').includes(query) ||
      (event.eventGroup?.name ?? '').toLocaleLowerCase('pt-BR').includes(query);

    return matchesStart && matchesEnd && matchesType && matchesQuery;
  });
}

function parseOptionalDate(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}
