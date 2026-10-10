import type { Meta, StoryObj } from '@storybook/angular';
import { expect, fn, userEvent, within } from 'storybook/test';
import { DashboardDemoComponent } from './dashboard-demo';

const openFeature = fn();

const meta: Meta<DashboardDemoComponent> = {
  component: DashboardDemoComponent,
  title: 'CACiC Eventos/Landing/Smart Dashboard',
  tags: ['autodocs', 'landing-showcase'],
  render: () => ({
    props: { onFeature: openFeature },
    template: '<app-landing-dashboard-demo (openFeature)="onFeature($event)" />',
  }),
  parameters: { a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<DashboardDemoComponent>;

export const Playground: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Presenças off-line pendentes/ }));
    await expect(openFeature).toHaveBeenCalledWith('attendance');
  },
};

export const DarkReducedMotion: Story = {
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Ver certificados' }));
    await expect(openFeature).toHaveBeenCalledWith('certificates');
  },
};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'light' },
};
