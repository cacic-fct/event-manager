import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { PrizeDrawChanceMode } from '@cacic-fct/event-manager-admin-contracts';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { of } from 'rxjs';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';
import { PermissionsService } from '../permissions/permissions.service';
import { AdminPrizeDrawStoryState, createAdminPrizeDrawStoryHandlers } from './prize-draw-story.handlers';
import { PRIZE_DRAW_STORY_ID, prizeDrawStoryFullNames, prizeDrawStoryWinnerContact } from './prize-draw-story.fixtures';
import { PrizeDrawsPageComponent } from './prize-draws-page.component';
import { signal } from '@angular/core';
import { graphql, HttpResponse } from 'msw';
import { createAdminEvent, createAdminMajorEvent } from '../testing/admin-entity-fixtures';
import { ADMIN_SHELL_CONTEXT } from '../shared/admin-shell-context';
import { EventWorkspaceContextService } from '../event-workspace/event-workspace-context.service';

type StoryArgs = AdminPrizeDrawStoryState & {
  canEdit: boolean;
};

const defaultArgs: StoryArgs = {
  chanceMode: 'EQUAL',
  frozen: false,
  resultsCount: 2,
  eligibleCount: 18,
  empty: false,
  requestDelay: 0,
  speed: 'DRAMATIC',
  winnerName: prizeDrawStoryFullNames[2],
  countdownSeconds: 3,
  canEdit: true,
};

let activeArgs = defaultArgs;

const meta: Meta<StoryArgs> = {
  component: PrizeDrawsPageComponent,
  title: 'CACiC Eventos/Sorteios/Configuração administrativa',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    chanceMode: { control: 'inline-radio', options: ['EQUAL', 'WEIGHTED'] satisfies PrizeDrawChanceMode[] },
    frozen: { control: 'boolean' },
    resultsCount: { control: { type: 'range', min: 0, max: 3, step: 1 } },
    eligibleCount: { control: { type: 'range', min: 1, max: 80, step: 1 } },
    requestDelay: { control: { type: 'range', min: 0, max: 3000, step: 100 } },
    canEdit: { control: 'boolean' },
    empty: { control: 'boolean' },
    speed: { table: { disable: true } },
    winnerName: { table: { disable: true } },
    countdownSeconds: { table: { disable: true } },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
    msw: { handlers: { graphql: createAdminPrizeDrawStoryHandlers(() => activeArgs) } },
  },
  render: (args) => {
    activeArgs = { ...defaultArgs, ...args };
    return { props: {} };
  },
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: ActivatedRoute,
          useFactory: () => {
            const drawId = activeArgs.empty ? null : PRIZE_DRAW_STORY_ID;
            const paramMap = convertToParamMap(drawId ? { drawId } : {});
            return { paramMap: of(paramMap), snapshot: { paramMap } };
          },
        },
        { provide: PermissionsService, useValue: { has: () => activeArgs.canEdit } },
        { provide: AdminFeedbackService, useValue: { error: () => undefined } },
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Configurar sorteio' })).toBeVisible();
    await expect(canvas.getByDisplayValue('Sorteio de boas-vindas')).toBeVisible();
    expect(canvas.getByRole('link', { name: /Página pública/i }).getAttribute('href')).toContain(
      `/app/draws/event/event-story-1#draw-${PRIZE_DRAW_STORY_ID}`,
    );
    await expect(canvas.getByRole('link', { name: /Modo demonstração/i })).toBeEnabled();
    await expect(canvas.getByRole('link', { name: /Ir para o sorteio/i })).toBeEnabled();
  },
};

const historicalDate = new Date(Date.now() - 7 * 86400000).toISOString();
const targetEvents = Array.from({ length: 50 }, (_, index) => createAdminEvent({
  id: `target-event-${index + 1}`, name: `Evento ${index + 1}`, startDate: historicalDate, endDate: historicalDate,
}));
const targetMajors = Array.from({ length: 50 }, (_, index) => createAdminMajorEvent({
  id: `target-major-${index + 1}`, name: `Grande evento ${index + 1}`, startDate: historicalDate, endDate: historicalDate,
}));

export const SearchableHistoricalTargets: Story = {
  args: { empty: true },
  decorators: [applicationConfig({ providers: [
    { provide: ADMIN_SHELL_CONTEXT, useValue: true },
    { provide: EventWorkspaceContextService, useValue: { scopeSwitchBlocked: signal(false) } },
    { provide: ActivatedRoute, useValue: {
      paramMap: of(convertToParamMap({})),
      queryParamMap: of(convertToParamMap({ eventId: 'target-event-49' })),
      snapshot: { paramMap: convertToParamMap({}) },
    } },
  ] })],
  parameters: { msw: { handlers: { graphql: [
    graphql.query('ListEvents', ({ variables }) => {
      const skip = Number(variables['skip'] ?? 0);
      const take = Number(variables['take'] ?? 20);
      const query = String(variables['query'] ?? '').toLocaleLowerCase('pt-BR');
      return HttpResponse.json({ data: { events: targetEvents.filter((event) => event.name.toLocaleLowerCase('pt-BR').includes(query)).slice(skip, skip + take) } });
    }),
    graphql.query('ListMajorEvents', ({ variables }) => {
      const skip = Number(variables['skip'] ?? 0);
      const take = Number(variables['take'] ?? 20);
      const query = String(variables['query'] ?? '').toLocaleLowerCase('pt-BR');
      return HttpResponse.json({ data: { majorEvents: targetMajors.filter((event) => event.name.toLocaleLowerCase('pt-BR').includes(query)).slice(skip, skip + take) } });
    }),
    graphql.query('GetEvent', ({ variables }) => HttpResponse.json({ data: { event: targetEvents.find((event) => event.id === variables['id']) } })),
    ...createAdminPrizeDrawStoryHandlers(() => activeArgs),
  ] } } },
  play: async ({ canvasElement }) => {
    if (new URL(canvasElement.ownerDocument.URL).searchParams.get('embed') === 'true') return;
    const picker = canvasElement.querySelector('app-event-target-picker');
    if (!picker) throw new Error('Expected a searchable draw target picker.');
    const targets = within(picker as HTMLElement);
    await expect(await targets.findByText('Evento 49')).toBeVisible();
    await userEvent.click(targets.getByRole('button', { name: 'Trocar' }));
    await userEvent.click(await targets.findByRole('button', { name: 'Próxima página' }));
    await userEvent.click(await targets.findByRole('button', { name: 'Selecionar Evento 26' }));
    await expect(targets.getByText('Evento 26')).toBeVisible();
  },
};

export const WeightedFrozenList: Story = {
  args: { chanceMode: 'WEIGHTED', frozen: true, eligibleCount: 42 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Lista congelada')).toBeVisible();
    await expect(canvas.getByText('Lista da configuração salva')).toBeVisible();
  },
};

export const ScopedEventInventory: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const contextHeader = await canvas.findByRole('button', { name: /Todos os sorteios/i });
    await expect(contextHeader).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(contextHeader);
    await userEvent.click(await canvas.findByRole('link', { name: 'Mostrar sorteios de Abertura da SECOMPP' }));
    await expect(
      canvas.getByRole('button', { name: /Abertura da SECOMPP/i }),
    ).toHaveAttribute('aria-expanded', 'false');
    await expect(canvas.getByRole('heading', { name: 'Novo sorteio' })).toBeVisible();
    await expect(canvasElement.querySelector('app-event-target-picker')).toHaveTextContent('Abertura da SECOMPP');
  },
};

export const ResultsAndContactReveal: Story = {
  args: { resultsCount: 3 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const contactButtons = await canvas.findAllByRole('button', { name: /Contato/i });
    await userEvent.click(contactButtons[0]);
    await expect(await canvas.findByText(prizeDrawStoryWinnerContact.email)).toBeVisible();
  },
};

export const ExclusionManagement: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const excludeButton = await canvas.findByRole('button', {
      name: `Excluir ${prizeDrawStoryFullNames[0]} do sorteio`,
    });
    await userEvent.click(excludeButton);
    await expect(
      canvas.getByRole('button', { name: `Reincluir ${prizeDrawStoryFullNames[0]} no sorteio` }),
    ).toBeVisible();
  },
};

export const EmptyNewSetup: Story = {
  args: { empty: true, resultsCount: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Novo sorteio' })).toBeVisible();
    const emptyMessage = canvas.getByText('Nenhum sorteio salvo');
    await expect(emptyMessage).toBeVisible();
    const emptyState = emptyMessage.closest('.admin-list-empty');
    await expect(emptyState?.querySelector('mat-icon')).toHaveTextContent('hide_source');
    await expect(canvas.queryByText('Crie a primeira configuração no painel ao lado.')).not.toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: { requestDelay: 1800 },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByLabelText('Carregando configuração do sorteio')).toBeVisible();
  },
};

export const ReadOnlyMobile: Story = {
  args: { canEdit: false, chanceMode: 'WEIGHTED', eligibleCount: 56 },
  globals: { theme: 'dark', motion: 'reduced' },
  parameters: { viewport: { defaultViewport: 'mobile' } },
};
