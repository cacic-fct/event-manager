import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import { HttpResponse, delay, http } from 'msw';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { Calendar } from './calendar-page';
import {
  CalendarStoryCollectionControls,
  calendarStoryCollectionControlArgTypes,
  calendarStoryCollectionDefaultControls,
  createCalendarStoryEvents,
} from './story-fixtures';

type CalendarApiState = 'ready' | 'loading' | 'error';

interface CalendarPageStoryArgs extends CalendarStoryCollectionControls {
  apiState: CalendarApiState;
  latencyMs: number;
  subscribedCount: number;
}

interface CalendarStoryContext {
  args: CalendarPageStoryArgs;
}

const defaultArgs: CalendarPageStoryArgs = {
  ...calendarStoryCollectionDefaultControls,
  apiState: 'ready',
  latencyMs: 120,
  subscribedCount: 3,
};

const onlineContext = createStoryContext();

const meta: Meta<CalendarPageStoryArgs> = {
  component: Calendar,
  title: 'CACiC Eventos/Calendar/Page',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    ...calendarStoryCollectionControlArgTypes,
    apiState: { control: 'select', options: ['ready', 'loading', 'error'] },
    latencyMs: { control: { type: 'range', min: 0, max: 2_000, step: 100 } },
    subscribedCount: { control: { type: 'range', min: 0, max: 30, step: 1 } },
  },
  render: (args) => renderStory(args, onlineContext),
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
    ...storyParameters(onlineContext),
  },
};

export default meta;

type Story = StoryObj<CalendarPageStoryArgs>;

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
  await expect(await canvas.findByText('Inscrito')).toBeVisible();

  const searchInput = canvas.getByRole('searchbox', { name: 'Buscar eventos' });
  await expect(canvas.queryByLabelText('Tipo')).not.toBeInTheDocument();
  await userEvent.click(canvas.getByRole('button', { name: 'Mostrar filtros' }));
  await expect(canvas.getByLabelText('Tipo')).toBeVisible();
  await userEvent.clear(searchInput);
  await userEvent.type(searchInput, 'sem resultado storybook');
  await userEvent.click(canvas.getByRole('button', { name: 'Buscar eventos' }));
  await expect(await canvas.findByText('Nenhum evento encontrado.')).toBeVisible();
  await userEvent.clear(searchInput);
  await userEvent.click(canvas.getByRole('button', { name: 'Buscar eventos' }));
  await expectCalendarEventVisible(canvasElement);

  await userEvent.click(await canvas.findByRole('button', { name: 'Visualização semanal' }));
  await expect(await canvas.findByRole('button', { name: 'Próxima semana' })).toBeVisible();
  await userEvent.click(await canvas.findByRole('button', { name: 'Ir para hoje' }));
  await expectCalendarEventVisible(canvasElement);
  await userEvent.click(await canvas.findByRole('button', { name: 'Visualização em lista' }));
  await expectCalendarEventVisible(canvasElement);
};

export const Playground: Story = {
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OfflineFallback: Story = {
  args: { eventCount: 0 },
  globals: { theme: 'dark', network: 'offline', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Calendário')).toBeVisible();
  },
};

export const DenseCalendar: Story = {
  args: { eventCount: 30, subscribedCount: 12, latencyMs: 0 },
  play: async ({ canvasElement }) => {
    const links = await within(canvasElement).findAllByRole('link', {}, { timeout: 5_000 });
    await expect(links.length).toBeGreaterThan(20);
  },
};

export const Empty: Story = {
  args: { eventCount: 0, subscribedCount: 0, latencyMs: 0 },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Nenhum evento encontrado.')).toBeVisible();
  },
};

export const Loading: Story = {
  args: { apiState: 'loading' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('progressbar')).toBeVisible();
  },
};

export const ApiError: Story = {
  args: { apiState: 'error' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Não foi possível carregar o calendário.')).toBeVisible();
  },
};

function createStoryContext(args: Partial<CalendarPageStoryArgs> = {}): CalendarStoryContext {
  return {
    args: { ...defaultArgs, ...args },
  };
}

function renderStory(args: CalendarPageStoryArgs, context: CalendarStoryContext) {
  context.args = { ...defaultArgs, ...args };
  return { props: {} };
}

function storyParameters(context: CalendarStoryContext) {
  return {
    msw: {
      handlers: {
        graphql: [
          http.post('/api/graphql', async ({ request }) => {
            const body = (await request.json()) as { query?: string; variables?: Record<string, unknown> };
            if (context.args.apiState === 'loading') {
              await delay('infinite');
            }
            if (context.args.latencyMs > 0) {
              await delay(context.args.latencyMs);
            }
            if (context.args.apiState === 'error') {
              return HttpResponse.json({ errors: [{ message: 'Não foi possível carregar o calendário.' }] });
            }
            if (body.query?.includes('CurrentUserCalendarSubscribedEvents')) {
              const eventIds = createCalendarStoryEvents(context.args)
                .slice(0, context.args.subscribedCount)
                .map((event) => ({ event: { id: event.id } }));
              return HttpResponse.json({
                data: {
                  currentUserSubscribedItems: eventIds,
                  currentUserMajorEventSubscriptions: [],
                },
              });
            }

            if (body.query?.includes('publicCalendarEvents')) {
              return HttpResponse.json({
                data: {
                  publicCalendarEvents: filterCalendarEvents(
                    createCalendarStoryEvents(context.args),
                    body.variables ?? {},
                  ),
                },
              });
            }

            return HttpResponse.json({ data: {} });
          }),
        ],
      },
    },
  };
}

function filterCalendarEvents(events: PublicEvent[], variables: Record<string, unknown>): PublicEvent[] {
  const query = String(variables['query'] ?? '')
    .trim()
    .toLocaleLowerCase('pt-BR');
  const eventType = variables['eventType'];
  const startDateFrom = parseOptionalDate(variables['startDateFrom']);
  const startDateUntil = parseOptionalDate(variables['startDateUntil']);

  return events.filter((event) => {
    const startDate = Date.parse(event.startDate);
    const matchesStart = startDateFrom === null || startDate >= startDateFrom;
    const matchesEnd = startDateUntil === null || startDate <= startDateUntil;
    const matchesType = typeof eventType !== 'string' || eventType === 'ALL' || event.type === eventType;
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
