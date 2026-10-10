import type { Meta, StoryObj } from '@storybook/angular';
import { expect } from 'storybook/test';
import { PRIZE_DRAW_STORY_PUBLIC_URL } from '../prize-draw-story.fixtures';
import { PrizeDrawQrCodeComponent } from './prize-draw-qr-code.component';

type StoryArgs = {
  value: string;
  size: number;
};

const meta: Meta<StoryArgs> = {
  component: PrizeDrawQrCodeComponent,
  title: 'Admin/Prize Draws/Results/QR Code',
  tags: ['autodocs'],
  args: {
    value: PRIZE_DRAW_STORY_PUBLIC_URL,
    size: 176,
  },
  argTypes: {
    value: { control: 'text' },
    size: { control: { type: 'range', min: 120, max: 240, step: 8 } },
  },
  parameters: {
    docs: {
      description: {
        component: 'QR code preview for public prize draw results, including compact sizing behavior.',
      },
    },
    layout: 'centered',
    a11y: { test: 'error' },
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = canvasElement.querySelector('canvas');
    expect(canvas).toBeTruthy();
    expect(canvas?.width).toBeGreaterThan(0);
  },
};
