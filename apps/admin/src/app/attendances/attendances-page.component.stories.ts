import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import {
  AttendanceWorkspaceStoryControls,
  attendanceWorkspaceStoryControlArgTypes,
  attendanceWorkspaceStoryDefaultControls,
  createAttendanceWorkspaceStoryController,
} from './attendance-workspace-story.fixtures';
import { AttendancesPageComponent } from './attendances-page.component';

const controller = createAttendanceWorkspaceStoryController();

const meta: Meta<AttendanceWorkspaceStoryControls> = {
  component: AttendancesPageComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Attendances/Page',
  tags: ['autodocs'],
  args: attendanceWorkspaceStoryDefaultControls,
  argTypes: attendanceWorkspaceStoryControlArgTypes,
  render: controller.render,
  decorators: [applicationConfig({ providers: [controller.provider] })],
  parameters: { layout: 'fullscreen', a11y: { test: 'todo' } },
};

export default meta;
type Story = StoryObj<AttendanceWorkspaceStoryControls>;

export const Playground: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('tab', { name: /Por evento/ })).toHaveAttribute('aria-selected', 'true');
    await expect(canvas.getByRole('heading', { name: 'Presenças off-line em revisão' })).toBeVisible();
    await userEvent.click(canvas.getByRole('tab', { name: /Por grande evento/ }));
    await expect(canvas.getByRole('heading', { name: 'Presenças no grande evento' })).toBeVisible();
  },
};

export const EmptyWorkspace: Story = {
  args: {
    eventCount: 0,
    selectedEvent: false,
    attendanceCount: 0,
    explicitAbsenceCount: 0,
    implicitAbsenceCount: 0,
    offlineSubmissionCount: 0,
    majorEventPersonCount: 0,
    selectedMajorEventPerson: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Nenhum evento encontrado')).toBeVisible();
    await userEvent.click(canvas.getByRole('tab', { name: /Por grande evento/ }));
    await expect(canvas.getByText('Nenhuma pessoa carregada')).toBeVisible();
  },
};

export const DenseWorkspace: Story = {
  args: { eventCount: 30, attendanceCount: 80, offlineSubmissionCount: 30, majorEventPersonCount: 50 },
  parameters: { viewport: { defaultViewport: 'desktop' } },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('80 registros')).toBeVisible();
  },
};

export const CompactWorkspace: Story = {
  args: { eventCount: 6, attendanceCount: 8, offlineSubmissionCount: 2 },
  parameters: { viewport: { defaultViewport: 'tablet' } },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('tablist')).toBeVisible();
  },
};

export const FrozenSportsEvent: Story = {
  args: { frozenEvent: true, sportsEventCount: 8 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Evento congelado' })).toBeVisible();
    await expect(canvas.getAllByLabelText('Partida de torneio esportivo').length).toBeGreaterThan(1);
  },
};
