import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { TooOldDialogComponent } from './too-old.component';

const meta: Meta<TooOldDialogComponent> = {
  component: TooOldDialogComponent,
  title: 'Shared/Service Worker/Too Old Dialog',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<TooOldDialogComponent>;

export const BlockingUpdate: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('A versão do seu aplicativo é muito antiga')).toBeVisible();
  },
};

