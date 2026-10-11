import type { Meta, StoryObj } from '@storybook/angular';
import { expect } from 'storybook/test';

import { CacicLogoComponent } from './cacic-logo.component';

const meta: Meta<CacicLogoComponent> = {
  title: 'Shared/Brand/CACiC Logo',
  component: CacicLogoComponent,
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
