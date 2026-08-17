import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import {
  AttendanceWorkspaceStoryControls,
  attendanceWorkspaceStoryControlArgTypes,
  attendanceWorkspaceStoryDefaultControls,
  createAttendanceWorkspaceStoryController,
} from './attendance-workspace-story.fixtures';
import { MajorEventAttendancesComponent } from './major-event-attendances.component';

const controller = createAttendanceWorkspaceStoryController();

const meta: Meta<AttendanceWorkspaceStoryControls> = {
  component: MajorEventAttendancesComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Attendances/Major Event Workbench',
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
    await expect(canvas.getByRole('heading', { name: 'Presenças no grande evento' })).toBeVisible();
    await expect(canvas.getByRole('list', { name: 'Atividades frequentadas' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Carregar pessoas' }));
  },
};

export const DenseParticipation: Story = {
  args: { majorEventPersonCount: 50, attendedActivitiesPerPerson: 12 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('12 atividades frequentadas')).toBeVisible();
    await expect(canvas.getAllByText(/atividades frequentadas/).length).toBeGreaterThan(20);
  },
};

export const PersonWithoutAttendance: Story = {
  args: { attendedActivitiesPerPerson: 0 },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Nenhuma presença registrada')).toBeVisible();
  },
};

export const NoPersonSelected: Story = {
  args: { selectedMajorEventPerson: false },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('heading', { name: 'Selecione uma pessoa' })).toBeVisible();
  },
};

export const EmptyMajorEvent: Story = {
  args: { majorEventPersonCount: 0, selectedMajorEventPerson: false },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Nenhuma pessoa carregada')).toBeVisible();
  },
};

export const LongNamesTablet: Story = {
  args: { longNames: true, majorEventPersonCount: 18, attendedActivitiesPerPerson: 6 },
  parameters: { viewport: { defaultViewport: 'tablet' } },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await expect((await within(canvasElement).findAllByText(/representante da comunidade/)).length).toBeGreaterThan(5);
  },
};
