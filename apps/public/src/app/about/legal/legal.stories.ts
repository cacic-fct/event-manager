import type { Meta, StoryObj } from '@storybook/angular';
import { HttpResponse, http } from 'msw';
import { expect, userEvent, within } from 'storybook/test';
import { Legal } from './legal';

const meta: Meta<Legal> = {
  component: Legal,
  title: 'CACiC Eventos/About/Legal/Page',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<Legal>;

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await userEvent.tab();
  const buttons = canvas.queryAllByRole('button');
  const enabledButton = buttons.find(
    (button) => !button.hasAttribute('disabled') && button.getAttribute('aria-disabled') !== 'true',
  );
  if (enabledButton) {
    await userEvent.hover(enabledButton);
    await expect(enabledButton).toBeVisible();
  }
  const links = canvas.queryAllByRole('link');
  if (links[0]) {
    await expect(links[0]).toBeVisible();
  }
};

export const Playground: Story = {
  args: {},
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const LicensesUnavailable: Story = {
  ...Playground,
  parameters: {
    msw: {
      handlers: [http.get('/app/3rdpartylicenses.txt', () => new HttpResponse(null, { status: 503 }))],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Não foi possível obter a lista de licenças.')).toBeVisible();
  },
};

export const MobileDarkReducedMotion: Story = {
  ...Playground,
  globals: { ...Playground.globals, theme: 'dark', motion: 'reduced' },
  parameters: {
    ...Playground.parameters,
    viewport: { defaultViewport: 'mobile' },
  },
};
