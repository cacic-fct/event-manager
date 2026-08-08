import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { TwemojiComponent } from './twemoji.component';

const meta: Meta<TwemojiComponent> = {
  component: TwemojiComponent,
  title: 'Shared/Components/Twemoji',
  tags: ['autodocs'],
  args: { emoji: '🏆' },
  argTypes: {
    emoji: { control: 'text' },
  },
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<TwemojiComponent>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('img', { name: '🏆' })).toBeVisible();
  },
};
