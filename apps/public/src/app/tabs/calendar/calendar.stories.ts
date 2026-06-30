import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { Calendar } from './calendar';

const meta: Meta<Calendar> = {
  component: Calendar,
  title: 'Public/Tabs/Calendar/Calendar',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<Calendar>;

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await expect(await canvas.findByRole('link', { name: /Abrir evento Arquitetura Angular com Signals/ })).toBeVisible();

  await userEvent.click(await canvas.findByRole('combobox', { name: 'Tipo' }));
  await userEvent.click(await within(document.body).findByRole('option', { name: 'Palestra' }));
  await expect(await canvas.findByText('Acessibilidade em produtos digitais')).toBeVisible();

  const searchInput = canvas.getByRole('searchbox', { name: 'Buscar eventos' });
  await userEvent.clear(searchInput);
  await userEvent.type(searchInput, 'GraphQL');
  await userEvent.click(canvas.getByRole('button', { name: /Buscar/ }));
  await expect(await canvas.findByText('Nenhum evento encontrado.')).toBeVisible();

  await userEvent.click(await canvas.findByRole('button', { name: 'Visualização semanal' }));
  await expect(await canvas.findByRole('button', { name: 'Próxima semana' })).toBeVisible();
  await userEvent.click(await canvas.findByRole('button', { name: 'Ir para hoje' }));
};

export const Online: Story = {
  args: {},
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OfflineFallback: Story = {
  args: {},
  globals: { theme: 'light', network: 'offline' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};
