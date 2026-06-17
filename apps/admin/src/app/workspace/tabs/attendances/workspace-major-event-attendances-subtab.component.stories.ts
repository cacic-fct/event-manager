import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { WorkspaceMajorEventAttendancesSubtabComponent } from './workspace-major-event-attendances-subtab.component';

const meta: Meta<WorkspaceMajorEventAttendancesSubtabComponent> = {
  component: WorkspaceMajorEventAttendancesSubtabComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Attendances/Workspace Major Event Attendances Subtab',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<WorkspaceMajorEventAttendancesSubtabComponent>;

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await userEvent.tab();
  const buttons = canvas.queryAllByRole('button');
  const enabledButton = buttons.find(
    (button) => !button.hasAttribute('disabled') && button.getAttribute('aria-disabled') !== 'true',
  );
  if (enabledButton) {
    await userEvent.hover(enabledButton);
    await expect(enabledButton).toBeVisible();
  }
  const links = canvas.queryAllByRole('link');
  if (links[0]) {
    await expect(links[0]).toBeVisible();
  }
};

export const DataLoaded: Story = {
  args: {},
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};
