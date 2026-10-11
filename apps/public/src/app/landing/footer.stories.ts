import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { LandingFooterComponent } from './footer';

const meta: Meta<LandingFooterComponent> = {
  component: LandingFooterComponent,
  title: 'Public/Landing/Footer',
  tags: ['autodocs'],
  parameters: {
    controls: { disable: true },
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Institutional footer reused across the public CACiC Eventos pages.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<LandingFooterComponent>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('CACiC Eventos')).toBeVisible();
    await expect(canvas.getByRole('navigation', { name: 'Links institucionais' })).toBeVisible();
    await expect(
      new URL(canvas.getByRole('link', { name: 'Validar certificado' }).getAttribute('href') ?? '', window.location.origin)
        .pathname,
    ).toBe('/validate');
  },
};
