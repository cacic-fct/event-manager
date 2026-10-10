import type { Meta, StoryObj } from '@storybook/angular';
import { expect, fn, userEvent, within } from 'storybook/test';
import { DashboardDemoComponent } from './dashboard-demo';

const openFeature = fn();

const meta: Meta<DashboardDemoComponent> = {
  component: DashboardDemoComponent,
  title: 'Public/Landing/Demos/Dashboard',
  tags: ['autodocs', 'landing-showcase'],
  render: () => ({
    props: { onFeature: openFeature },
    template: '<app-landing-dashboard-demo (openFeature)="onFeature($event)" />',
  }),
  parameters: { controls: { disable: true }, a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<DashboardDemoComponent>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Presenças off-line pendentes/ }));
    await expect(openFeature).toHaveBeenCalledWith('attendance');
  },
};

export const CertificateShortcut: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Ver certificados' }));
    await expect(openFeature).toHaveBeenCalledWith('certificates');
  },
};
