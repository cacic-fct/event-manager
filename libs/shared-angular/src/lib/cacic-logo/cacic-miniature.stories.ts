import type { Meta, StoryObj } from '@storybook/angular';
import { expect } from 'storybook/test';

import { CacicMiniatureComponent } from './cacic-miniature.component';

const meta: Meta<CacicMiniatureComponent> = {
  title: 'Shared/Brand/CACiC Miniature',
  component: CacicMiniatureComponent,
  tags: ['autodocs'],
  argTypes: {
    width: { control: 'text', description: 'CSS width applied to the SVG.' },
    height: { control: 'text', description: 'CSS height applied to the SVG.' },
  },
  args: {
    width: '240px',
    height: '120px',
  },
};

export default meta;
type Story = StoryObj<CacicMiniatureComponent>;

export const Playground: Story = {
  render: (args) => ({
    props: args,
    template: `<lib-cacic-miniature class="logo-light-mode" [width]="width" [height]="height"></lib-cacic-miniature>`,
  }),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('svg')).toBeVisible();
  },
};

export const LightForeground: Story = {
  render: (args) => ({
    props: args,
    template: `<lib-cacic-miniature class="logo-bark-mode" [width]="width" [height]="height"></lib-cacic-miniature>`,
  }),
  parameters: { backgrounds: { default: 'dark-surface' } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('svg')).toBeVisible();
  },
};
