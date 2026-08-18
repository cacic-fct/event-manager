import type { Meta, StoryObj } from '@storybook/angular';
import { expect } from 'storybook/test';

import { CacicLogoComponent } from './cacic-logo.component';

const meta: Meta<CacicLogoComponent> = {
  title: 'CACiC Eventos/Shared/Brand/CACiC logo',
  component: CacicLogoComponent,
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
type Story = StoryObj<CacicLogoComponent>;

export const Playground: Story = {
  render: (args) => ({
    props: args,
    template: `<lib-cacic-logo class="logo-light-mode" [width]="width" [height]="height"></lib-cacic-logo>`,
  }),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('svg')).toBeVisible();
  },
};

export const CompactNavigation: Story = {
  args: {
    width: '128px',
    height: '74px',
  },
  render: Playground.render,
};

export const LightForeground: Story = {
  render: (args) => ({
    props: args,
    template: `<lib-cacic-logo class="logo-bark-mode" [width]="width" [height]="height"></lib-cacic-logo>`,
  }),
  parameters: { backgrounds: { default: 'dark-surface' } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('svg')).toBeVisible();
  },
};

export const DarkReducedMotion: Story = {
  args: {
    width: '240px',
    height: '120px',
  },
  render: LightForeground.render,
  globals: { theme: 'dark', motion: 'reduced' },
};
