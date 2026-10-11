import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, within } from 'storybook/test';
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
  title: 'Admin/Attendance/Workspace',
  tags: ['autodocs'],
  args: attendanceWorkspaceStoryDefaultControls,
  argTypes: attendanceWorkspaceStoryControlArgTypes,
  render: controller.render,
  decorators: [applicationConfig({ providers: [controller.provider, { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ eventId: 'event-1' })) } }] })],
  parameters: {
    docs: {
      description: {
        component: 'Attendance workspace entry point with shared controls for event selection, records, offline submissions, and frozen events.',
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
    await expect(canvasElement.querySelector('app-event-context-picker')).toBeVisible();
    await expect(canvas.queryByRole('tablist')).not.toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: 'Presenças off-line em revisão' })).toBeVisible();

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
    await expect(canvasElement.querySelector('app-event-context-picker')).toBeVisible();
    await expect(canvas.queryByRole('tablist')).not.toBeInTheDocument();
  },
};

export const DenseWorkspace: Story = {
  args: { eventCount: 30, attendanceCount: 80, offlineSubmissionCount: 30, majorEventPersonCount: 50 },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('83 registros')).toBeVisible();
  },
};


export const FrozenSportsEvent: Story = {
  args: { frozenEvent: true, sportsEventCount: 8 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Evento congelado' })).toBeVisible();
    await expect(canvasElement.querySelector('app-event-context-picker')).toBeVisible();
  },
};
