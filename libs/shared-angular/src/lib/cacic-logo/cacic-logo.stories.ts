import type { Meta, StoryObj } from '@storybook/angular';

import { CacicLogoComponent } from './cacic-logo.component';

const meta: Meta<CacicLogoComponent> = {
  title: 'Shared/Assets/CacicLogo',
  component: CacicLogoComponent,
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
type Story = StoryObj<CacicLogoComponent>;

export const Default: Story = {};

export const LightForeground: Story = {
  args: {
    fillColor: '#ffffff',
  },
  parameters: {
    backgrounds: { default: 'dark-surface' },
  },
};
