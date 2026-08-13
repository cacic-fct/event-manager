import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { ScannerFeedbackService } from '@cacic-fct/shared-angular';
import { onlineAttendanceStoryHandlers } from '../online-attendance-story-fixtures';
import { OnlineAttendanceCodeComponent } from './code-page';

const meta: Meta<OnlineAttendanceCodeComponent> = {
  component: OnlineAttendanceCodeComponent,
  title: 'CACiC Eventos/Attendance/Self-registration/Code',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [ScannerFeedbackService],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
    msw: { handlers: onlineAttendanceStoryHandlers() },
  },
};

export default meta;

type Story = StoryObj<OnlineAttendanceCodeComponent>;

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await expect(await canvas.findByText('Arquitetura Angular com Signals')).toBeVisible();
  const codeInput = canvas.getByRole('textbox');
  const confirmButton = canvas.getByRole('button', { name: 'Confirmar' });
  await expect(confirmButton).toBeDisabled();
  await userEvent.type(codeInput, 'A1B2');
  await expect(confirmButton).toBeEnabled();
};

export const Playground: Story = {
  args: {},
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OfflineFallback: Story = {
  args: {},
  globals: { theme: 'dark', network: 'offline', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Arquitetura Angular com Signals')).toBeVisible();
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
