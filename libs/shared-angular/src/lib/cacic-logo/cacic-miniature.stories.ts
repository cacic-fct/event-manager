import type { Meta, StoryObj } from '@storybook/angular';

import { CacicMiniatureComponent } from './cacic-miniature.component';

const meta: Meta<CacicMiniatureComponent> = {
  title: 'Shared/Assets/CacicMiniature',
  component: CacicMiniatureComponent,
  tags: ['autodocs'],
  argTypes: {
    fillColor: { control: 'color' },
    width: { control: 'text' },
    height: { control: 'text' },
  },
  args: {
    fillColor: '#0f172a',
    width: '240px',
    height: '120px',
  },
};

export default meta;
type Story = StoryObj<CacicMiniatureComponent>;

export const Default: Story = {};

export const LightForeground: Story = {
  args: {
    fillColor: '#ffffff',
  },
  parameters: {
    backgrounds: { default: 'dark-surface' },
  },
};
