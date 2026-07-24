import type { Meta, StoryObj } from '@storybook/angular';

import { CacicLogoComponent } from './cacic-logo.component';

const meta: Meta<CacicLogoComponent> = {
  title: 'Shared/Assets/CacicLogo',
  component: CacicLogoComponent,
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
type Story = StoryObj<CacicLogoComponent>;

export const Default: Story = {
  render: (args) => ({
    props: args,
    template: `<lib-cacic-logo class="logo-light-mode" [width]="width" [height]="height"></lib-cacic-logo>`,
  }),
};

export const LightForeground: Story = {
  render: (args) => ({
    props: args,
    template: `<lib-cacic-logo class="logo-bark-mode" [width]="width" [height]="height"></lib-cacic-logo>`,
  }),
  parameters: { backgrounds: { default: 'dark-surface' } },
};
