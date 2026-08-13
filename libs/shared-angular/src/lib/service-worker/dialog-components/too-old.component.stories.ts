import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { TooOldDialogComponent } from './too-old.component';

const meta: Meta<TooOldDialogComponent> = {
  component: TooOldDialogComponent,
  title: 'CACiC Eventos/Shared/Service worker/Update required dialog',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<TooOldDialogComponent>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('A versão do seu aplicativo é muito antiga')).toBeVisible();
  },
};

export const MobileBlockingUpdate: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'OK' })).toBeVisible();
  },
};

export const DarkReducedMotion: Story = {
  globals: { theme: 'dark', motion: 'reduced' },
};
