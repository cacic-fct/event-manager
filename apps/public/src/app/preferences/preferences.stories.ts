import { provideRouter } from '@angular/router';
import { applicationConfig } from '@storybook/angular';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { Preferences } from './preferences';

const meta: Meta<Preferences> = {
  component: Preferences,
  title: 'Public/Preferences/Preferences',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
  decorators: [
    applicationConfig({
      providers: [provideRouter([])],
    }),
  ],
};

export default meta;

type Story = StoryObj<Preferences>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Preferências')).toBeVisible();
    await userEvent.hover(await canvas.findByRole('link', { name: /calendário/i }));
  },
};
