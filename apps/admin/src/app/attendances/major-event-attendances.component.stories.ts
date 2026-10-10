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
  title: 'Admin/Attendance/Major Events',
  tags: ['autodocs'],
  args: attendanceWorkspaceStoryDefaultControls,
  argTypes: attendanceWorkspaceStoryControlArgTypes,
  render: controller.render,
  decorators: [applicationConfig({ providers: [controller.provider] })],
  parameters: {
    docs: {
      description: {
        component: 'Major event attendance view with controls for people, attended activities, and selection state.',
      },
    },
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
};

export default meta;
type Story = StoryObj<AttendanceWorkspaceStoryControls>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Presenças no grande evento' })).toBeVisible();
    await expect(canvasElement.querySelector('.attended-event-list')).toBeVisible();
    await expect(canvas.getByText('Atividade 1 do grande evento')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Atualizar presenças' }));
  },
};

export const DenseParticipation: Story = {
  args: { majorEventPersonCount: 50, attendedActivitiesPerPerson: 12 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect((await canvas.findAllByText('12 atividades frequentadas')).length).toBeGreaterThan(0);
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

export const LongNames: Story = {
  args: { longNames: true, majorEventPersonCount: 18, attendedActivitiesPerPerson: 6 },
  play: async ({ canvasElement }) => {
    await expect((await within(canvasElement).findAllByText(/representante da comunidade/)).length).toBeGreaterThan(5);
  },
};
