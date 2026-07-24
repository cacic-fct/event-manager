import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { LandingFooterComponent } from './footer';

const meta: Meta<LandingFooterComponent> = {
  component: LandingFooterComponent,
  title: 'Public/Landing/Components/Footer',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Rodapé institucional reutilizado nas páginas públicas de apresentação do CACiC Eventos.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<LandingFooterComponent>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('CACiC Eventos')).toBeVisible();
    await expect(canvas.getByRole('navigation', { name: 'Links institucionais' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Validar certificado' })).toHaveAttribute('href', '/validate');
  },
};
