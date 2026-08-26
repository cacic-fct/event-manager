import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { PrizeDrawSpeed } from '@cacic-fct/event-manager-admin-contracts';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';
import { PermissionsService } from '../permissions/permissions.service';
import { AdminPrizeDrawStoryState, createAdminPrizeDrawStoryHandlers } from './prize-draw-story.handlers';
import { PRIZE_DRAW_STORY_ID, prizeDrawStoryFullNames } from './prize-draw-story.fixtures';
import { PrizeDrawPageComponent } from './prize-draw-page.component';

type StoryArgs = {
  speed: PrizeDrawSpeed;
  rosterSize: number;
  winnerName: string;
  countdownSeconds: 3 | 5;
  completedSpins: number;
  reducedMotion: boolean;
  requestDelay: number;
  demoMode: boolean;
};

const defaultArgs: StoryArgs = {
  speed: 'QUICK',
  rosterSize: 24,
  winnerName: prizeDrawStoryFullNames[2],
  countdownSeconds: 3,
  completedSpins: 2,
  reducedMotion: false,
  requestDelay: 0,
  demoMode: false,
};

let activeArgs = defaultArgs;
const handlerState = (): AdminPrizeDrawStoryState => ({
  chanceMode: 'EQUAL',
  frozen: false,
  resultsCount: activeArgs.completedSpins,
  eligibleCount: activeArgs.rosterSize,
  empty: false,
  requestDelay: activeArgs.requestDelay,
  speed: activeArgs.speed,
  winnerName: activeArgs.winnerName,
  countdownSeconds: activeArgs.countdownSeconds,
});

const meta: Meta<StoryArgs> = {
  component: PrizeDrawPageComponent,
  title: 'CACiC Eventos/Sorteios/Execução administrativa',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    speed: { control: 'inline-radio', options: ['INSTANT', 'QUICK', 'DRAMATIC'] },
    rosterSize: { control: { type: 'range', min: 0, max: 80, step: 1 } },
    winnerName: { control: 'select', options: prizeDrawStoryFullNames.slice(0, 24) },
    countdownSeconds: { control: 'inline-radio', options: [3, 5], if: { arg: 'speed', eq: 'DRAMATIC' } },
    completedSpins: { control: { type: 'range', min: 0, max: 3, step: 1 } },
    reducedMotion: { control: 'boolean' },
    requestDelay: { control: { type: 'range', min: 0, max: 2500, step: 100 } },
    demoMode: { control: 'boolean' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
    msw: { handlers: { graphql: createAdminPrizeDrawStoryHandlers(handlerState) } },
  },
  render: (args) => {
    activeArgs = { ...defaultArgs, ...args };
    installStoryMotionPreference(args.reducedMotion);
    return { props: {} };
  },
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: ActivatedRoute,
          useFactory: () => ({
            snapshot: {
              paramMap: convertToParamMap({ drawId: PRIZE_DRAW_STORY_ID }),
              queryParamMap: convertToParamMap(activeArgs.demoMode ? { demo: 'true' } : {}),
            },
          }),
        },
        { provide: PermissionsService, useValue: { has: () => true } },
        { provide: AdminFeedbackService, useValue: { error: () => undefined } },
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Playground: Story = {
  args: { speed: 'INSTANT', demoMode: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Sorteio de boas-vindas' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Iniciar demonstração' }));

    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByRole('heading', { name: activeArgs.winnerName })).toBeVisible();
    await expect(page.getByText('Nome sorteado')).toBeVisible();
    expect(canvasElement.ownerDocument.querySelector('mat-dialog-container canvas')).toBeTruthy();
    await userEvent.click(page.getByRole('button', { name: 'Fechar resultado' }));
  },
};

export const DramaticReady: Story = {
  args: { speed: 'DRAMATIC', countdownSeconds: 5, rosterSize: 48, completedSpins: 0 },
};

export const Completed: Story = {
  args: { completedSpins: 3, rosterSize: 38 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Não há outro giro disponível')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Sortear agora' })).toBeDisabled();
  },
};

export const EmptyEligibility: Story = {
  args: { rosterSize: 0, completedSpins: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Nenhuma pessoa elegível')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Sortear agora' })).toBeDisabled();
  },
};

export const ReducedMotionMobile: Story = {
  args: { speed: 'DRAMATIC', reducedMotion: true, rosterSize: 56, completedSpins: 0 },
  globals: { theme: 'dark', motion: 'reduced' },
  parameters: { viewport: { defaultViewport: 'mobile' } },
};

function installStoryMotionPreference(reducedMotion: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) =>
      ({
        matches: reducedMotion && query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => true,
      }) satisfies MediaQueryList,
  });
}
