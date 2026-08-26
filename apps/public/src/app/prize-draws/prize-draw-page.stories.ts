import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { PublicPrizeDrawChanceMode } from '@cacic-fct/event-manager-public-contracts';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { createPublicPrizeDrawStoryHandlers, PublicPrizeDrawStoryState } from './prize-draw-story.handlers';
import { PublicPrizeDrawPage } from './prize-draw-page';
import { publicPrizeDrawStoryId } from './prize-draw-story.fixtures';

type StoryArgs = PublicPrizeDrawStoryState;

const defaultArgs: StoryArgs = {
  drawCount: 1,
  spinCount: 3,
  chanceMode: 'EQUAL',
  frozen: false,
  requestDelay: 0,
};

let activeArgs = defaultArgs;

const meta: Meta<StoryArgs> = {
  component: PublicPrizeDrawPage,
  title: 'CACiC Eventos/Sorteios/Transparência pública',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    drawCount: { control: { type: 'range', min: 0, max: 4, step: 1 } },
    spinCount: { control: { type: 'range', min: 1, max: 8, step: 1 } },
    chanceMode: { control: 'inline-radio', options: ['EQUAL', 'WEIGHTED'] satisfies PublicPrizeDrawChanceMode[] },
    frozen: { control: 'boolean' },
    requestDelay: { control: { type: 'range', min: 0, max: 3000, step: 100 } },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
    msw: { handlers: { graphql: createPublicPrizeDrawStoryHandlers(() => activeArgs) } },
  },
  render: (args) => {
    activeArgs = { ...defaultArgs, ...args };
    installSilentStoryEventSource();
    return { props: {} };
  },
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: ActivatedRoute,
          useFactory: () => {
            const paramMap = convertToParamMap({ eventId: 'event-story-1' });
            return { snapshot: { data: { targetType: 'EVENT' }, paramMap } };
          },
        },
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Resultados dos sorteios' })).toBeVisible();
    await userEvent.click(canvas.getByText('Como este sorteio funciona'));
    await expect(await canvas.findByText('Chance de vencer')).toBeVisible();
    await expect(canvas.getByText('Entradas duplicadas')).toBeVisible();
  },
};

export const WeightedFrozenList: Story = {
  args: { chanceMode: 'WEIGHTED', frozen: true, spinCount: 5 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText('Como este sorteio funciona'));
    await expect(await canvas.findByText('Entradas ponderadas')).toBeVisible();
    await expect(canvas.getByText(/Congelada em/)).toBeVisible();
  },
};

export const MultipleDraws: Story = {
  args: { drawCount: 3, spinCount: 2 },
};

export const DeepLinkedDraw: Story = {
  args: { drawCount: 3, spinCount: 2 },
  beforeEach: () => {
    const previousHash = window.location.hash;
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}#draw-${publicPrizeDrawStoryId(1)}`,
    );
    return () =>
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${previousHash}`);
  },
  play: async ({ canvasElement }) => {
    const target = await within(canvasElement).findByRole('heading', { name: 'Sorteio 2' });
    const article = target.closest('article');
    expect(article).toBeTruthy();
    await waitFor(() => expect(Math.abs((article?.getBoundingClientRect().top ?? 0) - 80)).toBeLessThan(24));
  },
};

export const EmptyResults: Story = {
  args: { drawCount: 0 },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Nenhum resultado publicado')).toBeVisible();
  },
};

export const Loading: Story = {
  args: { requestDelay: 1800 },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByLabelText('Carregando sorteios')).toBeVisible();
  },
};

export const WeightedMobileDark: Story = {
  args: { chanceMode: 'WEIGHTED', frozen: true, spinCount: 8 },
  globals: { theme: 'dark', motion: 'reduced' },
  parameters: { viewport: { defaultViewport: 'mobile' } },
};

function installSilentStoryEventSource(): void {
  class SilentStoryEventSource {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSED = 2;
    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSED = 2;
    readonly readyState = 1;
    readonly withCredentials = true;
    readonly url: string;
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;

    constructor(url: string | URL) {
      this.url = String(url);
    }

    close(): void {
      return;
    }
    addEventListener(): void {
      return;
    }
    removeEventListener(): void {
      return;
    }
    dispatchEvent(): boolean {
      return true;
    }
  }

  Object.defineProperty(window, 'EventSource', {
    configurable: true,
    value: SilentStoryEventSource,
    writable: true,
  });
}
