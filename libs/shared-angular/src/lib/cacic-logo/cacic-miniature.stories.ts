import type { Meta, StoryObj } from '@storybook/angular';
import { expect } from 'storybook/test';

import { CacicMiniatureComponent } from './cacic-miniature.component';

const meta: Meta<CacicMiniatureComponent> = {
  title: 'CACiC Eventos/Shared/Brand/CACiC miniature',
  component: CacicMiniatureComponent,
  tags: ['autodocs'],
  argTypes: {
    width: { control: 'text', description: 'Largura CSS aplicada ao SVG.' },
    height: { control: 'text', description: 'Altura CSS aplicada ao SVG.' },
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

export const CompactAppIcon: Story = {
  args: {
    width: '64px',
    height: '88px',
  },
  render: Playground.render,
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

export const DarkReducedMotion: Story = {
  args: {
    width: '120px',
    height: '170px',
  },
  render: LightForeground.render,
  globals: { theme: 'dark', motion: 'reduced' },
};
