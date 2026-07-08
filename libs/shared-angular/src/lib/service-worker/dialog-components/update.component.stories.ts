import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { UpdateModalComponent } from './update.component';

const meta: Meta<UpdateModalComponent> = {
  component: UpdateModalComponent,
  title: 'Shared/Service Worker/Update Modal',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<UpdateModalComponent>;

export const Installing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Instalando atualização')).toBeVisible();
  },
};

