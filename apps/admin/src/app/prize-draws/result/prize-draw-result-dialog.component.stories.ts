import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import {
  PRIZE_DRAW_STORY_PUBLIC_URL,
  prizeDrawStoryFullNames,
  prizeDrawStoryLongFullName,
} from '../prize-draw-story.fixtures';
import { PrizeDrawResultDialogStoryHarness } from './prize-draw-result-dialog.story-harness';

type StoryArgs = {
  winnerFullName: string;
  drawTitle: string;
  spinDescription: string;
  demo: boolean;
};

const meta: Meta<StoryArgs> = {
  component: PrizeDrawResultDialogStoryHarness,
  title: 'Admin/Prize Draws/Results/Winner Dialog',
  tags: ['autodocs'],
  args: {
    winnerFullName: prizeDrawStoryFullNames[2],
    drawTitle: 'Sorteio de boas-vindas',
    spinDescription: 'Camiseta do evento',
    demo: false,
  },
  argTypes: {
    winnerFullName: { control: 'select', options: prizeDrawStoryFullNames.slice(0, 24) },
    drawTitle: { control: 'text' },
    spinDescription: { control: 'text' },
    demo: { control: 'boolean' },
  },
  parameters: {
    docs: {
      description: {
        component: 'Prize draw winner result dialog with a public link and full-screen presentation. Use the global motion control to inspect reduced-motion behavior.',
      },
    },
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Abrir resultado em tela cheia' }));
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByRole('heading', { name: prizeDrawStoryFullNames[2] })).toBeVisible();
    await expect(page.getByText('Nome sorteado')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Abrir página pública do sorteio' })).toHaveAttribute(
      'href',
      PRIZE_DRAW_STORY_PUBLIC_URL,
    );
    const dialog = canvasElement.ownerDocument.querySelector('mat-dialog-container');
    expect(dialog?.querySelector('app-prize-draw-confetti canvas')).toBeTruthy();
    expect(dialog?.querySelector('app-prize-draw-qr-code canvas')).toBeTruthy();
    expect((dialog?.getBoundingClientRect().width ?? 0) / window.innerWidth).toBeGreaterThan(0.9);
  },
};

export const DemoMode: Story = {
  args: { demo: true },
  play: async ({ canvasElement }) => {
    await openOverlay(canvasElement);
    await expect(await within(canvasElement.ownerDocument.body).findByText('Demonstração')).toBeVisible();
  },
};

export const LongFullName: Story = {
  args: { winnerFullName: prizeDrawStoryLongFullName },
  play: async ({ canvasElement }) => openOverlay(canvasElement),
};

async function openOverlay(canvasElement: HTMLElement): Promise<void> {
  await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Abrir resultado em tela cheia' }));
  await expect(await within(canvasElement.ownerDocument.body).findByText('Nome sorteado')).toBeVisible();
}
