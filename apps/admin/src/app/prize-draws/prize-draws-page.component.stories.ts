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

export const WeightedFrozenList: Story = {
  args: { chanceMode: 'WEIGHTED', frozen: true, eligibleCount: 42 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Lista congelada')).toBeVisible();
    await expect(canvas.getByText('Lista da configuração salva')).toBeVisible();
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
    await expect(canvas.getByText('Nenhum sorteio salvo')).toBeVisible();
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
