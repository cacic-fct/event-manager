import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { onlineAttendanceStoryHandlers } from '../online-attendance-story-fixtures';
import { OnlineAttendanceListComponent } from './event-list-page';

const meta: Meta<OnlineAttendanceListComponent> = {
  component: OnlineAttendanceListComponent,
  title: 'CACiC Eventos/Attendance/Self-registration/Event List',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
    msw: { handlers: onlineAttendanceStoryHandlers() },
  },
};

export default meta;

type Story = StoryObj<OnlineAttendanceListComponent>;

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await expect(
    await canvas.findByRole('link', { name: 'Confirmar presença em Arquitetura Angular com Signals' }),
  ).toBeVisible();
};

export const Playground: Story = {
  args: {},
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OfflineFallback: Story = {
  args: {},
  globals: { theme: 'dark', network: 'offline', motion: 'reduced' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const Empty: Story = {
  parameters: { msw: { handlers: onlineAttendanceStoryHandlers('empty') } },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Nenhuma presença pendente.')).toBeVisible();
  },
};

export const ApiError: Story = {
  parameters: { msw: { handlers: onlineAttendanceStoryHandlers('error') } },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Não foi possível carregar as presenças pendentes.'),
    ).toBeVisible();
  },
};
