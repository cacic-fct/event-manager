import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { UpdateModalComponent } from './update.component';

const meta: Meta<UpdateModalComponent> = {
  component: UpdateModalComponent,
  title: 'CACiC Eventos/Shared/Service worker/Installing update',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<UpdateModalComponent>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Instalando atualização')).toBeVisible();
  },
};

export const MobileInstallation: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile' },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('progressbar')).toBeVisible();
  },
};

export const DarkReducedMotion: Story = {
  globals: { theme: 'dark', motion: 'reduced' },
};
