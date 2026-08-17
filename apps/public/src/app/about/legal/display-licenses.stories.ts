import type { Meta, StoryObj } from '@storybook/angular';
import { HttpResponse, delay, http } from 'msw';
import { expect, userEvent, within } from 'storybook/test';
import { DisplayLicenses } from './display-licenses';

const meta: Meta<DisplayLicenses> = {
  component: DisplayLicenses,
  title: 'CACiC Eventos/About/Legal/Third-party Licenses',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<DisplayLicenses>;

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
  await expect(await canvas.findByText(/Mock gerado pelo Storybook/)).toBeVisible();
};

export const Playground: Story = {
  args: {},
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const LoadingDarkReducedMotion: Story = {
  ...Playground,
  globals: { ...Playground.globals, theme: 'dark', motion: 'reduced' },
  parameters: {
    msw: {
      handlers: {
        rest: [
          http.get('/app/3rdpartylicenses.txt', async () => {
            await delay('infinite');
            return HttpResponse.text('');
          }),
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Carregando licenças...')).toBeVisible();
  },
};

export const LoadError: Story = {
  parameters: {
    msw: {
      handlers: {
        rest: [http.get('/app/3rdpartylicenses.txt', () => new HttpResponse(null, { status: 503 }))],
      },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Não foi possível obter a lista de licenças.')).toBeVisible();
  },
};
