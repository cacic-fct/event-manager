import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { LecturerProfileComponent } from './lecturer-profile';

const meta: Meta<LecturerProfileComponent> = {
  component: LecturerProfileComponent,
  title: 'Public/Profile/Attendances/Lecturer Profile',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<LecturerProfileComponent>;

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const editButton = await canvas.findByRole('button', { name: /editar perfil/i });
  await expect(editButton).toBeVisible();
  await userEvent.click(editButton);
  await expect(await canvas.findByRole('button', { name: /salvar/i })).toBeVisible();
};

export const Ready: Story = {
  args: {},
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const Mobile: Story = {
  args: {},
  parameters: {
    viewport: { defaultViewport: 'mobile' },
  },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const Dark: Story = {
  args: {},
  parameters: {
    backgrounds: { default: 'dark' },
    viewport: { defaultViewport: 'desktop' },
  },
  globals: { theme: 'dark', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};
