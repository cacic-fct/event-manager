import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { UpdateModalComponent } from './update.component';

const meta: Meta<UpdateModalComponent> = {
  component: UpdateModalComponent,
  title: 'Shared/Service Worker/Installing Update Dialog',
  tags: ['autodocs'],
  parameters: {
    controls: { disable: true },
    layout: 'centered',
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<UpdateModalComponent>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Instalando atualização')).toBeVisible();
    await expect(canvas.getByRole('progressbar')).toBeVisible();
  },
};
