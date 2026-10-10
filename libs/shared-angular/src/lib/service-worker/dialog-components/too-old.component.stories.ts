import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { TooOldDialogComponent } from './too-old.component';

const meta: Meta<TooOldDialogComponent> = {
  component: TooOldDialogComponent,
  title: 'Shared/Service Worker/Update Required Dialog',
  tags: ['autodocs'],
  parameters: {
    controls: { disable: true },
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<TooOldDialogComponent>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('A versão do seu aplicativo é muito antiga')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'OK' })).toBeVisible();
  },
};
