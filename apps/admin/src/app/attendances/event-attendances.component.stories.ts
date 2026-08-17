import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import {
  AttendanceWorkspaceStoryControls,
  attendanceWorkspaceStoryControlArgTypes,
  attendanceWorkspaceStoryDefaultControls,
  createAttendanceWorkspaceStoryController,
} from './attendance-workspace-story.fixtures';
import { EventAttendancesComponent } from './event-attendances.component';

const controller = createAttendanceWorkspaceStoryController();

const meta: Meta<AttendanceWorkspaceStoryControls> = {
  component: EventAttendancesComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Attendances/Event Workbench',
  tags: ['autodocs'],
  args: attendanceWorkspaceStoryDefaultControls,
  argTypes: attendanceWorkspaceStoryControlArgTypes,
  render: controller.render,
  decorators: [applicationConfig({ providers: [controller.provider] })],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
    docs: {
      description: {
        component:
          'Interactive attendance workbench with deterministic events, category mixtures, absences, sports flags, and offline reconciliation.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<AttendanceWorkspaceStoryControls>;

export const Playground: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Eventos' })).toBeVisible();
    await expect(canvas.getByLabelText('Partida de torneio esportivo')).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Presenças off-line em revisão' })).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Ausências do evento' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Atualizar' }));
  },
};

export const DenseOperations: Story = {
  args: {
    eventCount: 30,
    attendanceCount: 80,
    explicitAbsenceCount: 20,
    implicitAbsenceCount: 20,
    offlineSubmissionCount: 30,
    sportsEventCount: 15,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('80 registros')).toBeVisible();
    await expect(canvas.getByText('30 pendência(s)')).toBeVisible();
    await expect(canvas.getByText('20 explícitas · 20 implícitas')).toBeVisible();
  },
};

export const NoEventSelected: Story = {
  args: {
    selectedEvent: false,
    attendanceCount: 0,
    explicitAbsenceCount: 0,
    implicitAbsenceCount: 0,
    offlineSubmissionCount: 0,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Selecione um evento' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Atualizar' })).toBeDisabled();
    await expect(canvas.getByText('Nenhuma presença carregada')).toBeVisible();
  },
};

export const EmptySearch: Story = {
  args: { eventCount: 0, selectedEvent: false, attendanceCount: 0, offlineSubmissionCount: 0 },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Nenhum evento encontrado')).toBeVisible();
  },
};

export const FrozenEvent: Story = {
  args: { frozenEvent: true },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('heading', { name: 'Evento congelado' })).toBeVisible();
  },
};

export const OfflineReconciliationOnly: Story = {
  args: {
    attendanceCount: 0,
    explicitAbsenceCount: 0,
    implicitAbsenceCount: 0,
    offlineSubmissionCount: 12,
  },
  globals: { theme: 'dark', network: 'offline', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('12 pendência(s)')).toBeVisible();
    await expect(canvas.getAllByRole('button', { name: 'Inspecionar presença off-line' })).toHaveLength(12);
  },
};

export const LongContentTablet: Story = {
  args: { longNames: true, attendanceCount: 12, eventCount: 10 },
  parameters: { viewport: { defaultViewport: 'tablet' } },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await expect((await within(canvasElement).findAllByText(/Atividade interdisciplinar/)).length).toBeGreaterThan(1);
  },
};
