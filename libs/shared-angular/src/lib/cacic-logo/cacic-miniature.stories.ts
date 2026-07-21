import type { Meta, StoryObj } from '@storybook/angular';

import { CacicMiniatureComponent } from './cacic-miniature.component';

const meta: Meta<CacicMiniatureComponent> = {
  title: 'Shared/Assets/CacicMiniature',
  component: CacicMiniatureComponent,
  tags: ['autodocs'],
  argTypes: {
    width: { control: 'text' },
    height: { control: 'text' },
  },
  args: {
    width: '240px',
    height: '120px',
  },
};

export default meta;
type Story = StoryObj<CacicMiniatureComponent>;

export const Default: Story = {
  render: (args) => ({
    props: args,
    template: `<lib-cacic-miniature class="logo-light-mode" [width]="width" [height]="height"></lib-cacic-miniature>`,
  }),
};

export const LightForeground: Story = {
  render: (args) => ({
    props: args,
    template: `<lib-cacic-miniature class="logo-bark-mode" [width]="width" [height]="height"></lib-cacic-miniature>`,
  }),
  parameters: { backgrounds: { default: 'dark-surface' } },
};
