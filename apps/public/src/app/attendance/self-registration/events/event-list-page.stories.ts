import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import {
  OnlineAttendanceStoryControls,
  createOnlineAttendanceStoryContext,
  onlineAttendanceStoryControlArgTypes,
  onlineAttendanceStoryDefaultControls,
  onlineAttendanceStoryHandlers,
  renderOnlineAttendanceStory,
} from '../online-attendance-story-fixtures';
import { OnlineAttendanceListComponent } from './event-list-page';

const storyContext = createOnlineAttendanceStoryContext();

const meta: Meta<OnlineAttendanceStoryControls> = {
  component: OnlineAttendanceListComponent,
  title: 'CACiC Eventos/Attendance/Self-registration/Event List',
  tags: ['autodocs'],
  args: onlineAttendanceStoryDefaultControls,
  argTypes: onlineAttendanceStoryControlArgTypes,
  render: (args) => renderOnlineAttendanceStory(args, storyContext),
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
    msw: { handlers: { graphql: onlineAttendanceStoryHandlers(storyContext) } },
  },
};

export default meta;
type Story = StoryObj<OnlineAttendanceStoryControls>;

const exerciseStory = async (canvasElement: HTMLElement, expectedCount: number) => {
  const canvas = within(canvasElement);
  const links = await canvas.findAllByRole('link', { name: /Confirmar presença em/i });
  await expect(links).toHaveLength(expectedCount);
  await expect(links[0]).toHaveAttribute('href', expect.stringContaining('/attendance/register/event-1'));
};

export const Playground: Story = {
  globals: { theme: 'light', network: 'online' },
  play: async ({ args, canvasElement }) => exerciseStory(canvasElement, args.eventCount),
};

export const DenseList: Story = {
  args: { eventCount: 12, latencyMs: 0 },
  play: async ({ canvasElement }) => exerciseStory(canvasElement, 12),
};

export const LongContentMobile: Story = {
  args: {
    eventCount: 6,
    name: 'Encontro interdisciplinar de tecnologia, ciência, cultura e acessibilidade',
    majorEventName: 'Grande evento universitário de inovação e extensão para toda a comunidade',
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', network: 'online', motion: 'reduced' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement, 6),
};

export const Empty: Story = {
  args: { state: 'empty', eventCount: 0 },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Nenhuma presença pendente.')).toBeVisible();
  },
};

export const Loading: Story = {
  args: { state: 'loading' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByLabelText('Carregando presenças pendentes')).toBeVisible();
  },
};

export const ApiError: Story = {
  args: { state: 'error' },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Não foi possível carregar as presenças pendentes.'),
    ).toBeVisible();
  },
};

export const OfflineFallback: Story = {
  args: { eventCount: 4 },
  globals: { theme: 'dark', network: 'offline', motion: 'reduced' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement, 4),
};
