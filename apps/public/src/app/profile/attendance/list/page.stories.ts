import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { Attendances } from './page';

const meta: Meta<Attendances> = {
  component: Attendances,
  title: 'Public/Profile/Attendances/Attendances',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<Attendances>;

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await userEvent.tab();
  const buttons = canvas.queryAllByRole('button');
  const enabledButton = buttons.find((button) => !button.hasAttribute('disabled') && button.getAttribute('aria-disabled') !== 'true');
  if (enabledButton) {
    await userEvent.hover(enabledButton);
    await expect(enabledButton).toBeVisible();
  }
  const links = canvas.queryAllByRole('link');
  if (links[0]) {
    await expect(links[0]).toBeVisible();
  }
};

const exerciseStandaloneStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await expect(await canvas.findByText('Certificados avulsos')).toBeVisible();
  await expect(await canvas.findByText('Atividades complementares')).toBeVisible();
  await exerciseStory(canvasElement);
};

export const Online: Story = {
  args: {},
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStandaloneStory(canvasElement),
};

export const OfflineFallback: Story = {
  args: {},
  globals: { theme: 'light', network: 'offline' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const FilteredPresent: Story = {
  args: {},
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => {
    await exerciseStory(canvasElement);
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('combobox', { name: /filtrar resultados/i }));
    const listbox = within(document.body);
    await userEvent.click(await listbox.findByRole('option', { name: 'Presente' }));
    await expect(await canvas.findByText(/Grande evento com presença/)).toBeVisible();
    await expect(await canvas.findByText(/Oficina presente sem inscrição/)).toBeVisible();
    await expect(await canvas.findByText(/Grupo presente sem inscrição/)).toBeVisible();
  },
};
