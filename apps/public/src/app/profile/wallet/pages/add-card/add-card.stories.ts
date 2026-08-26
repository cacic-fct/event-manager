import { provideRouter } from '@angular/router';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { WalletAddCard } from './add-card';

const meta: Meta<WalletAddCard> = {
  component: WalletAddCard,
  title: 'CACiC Eventos/Profile/Wallet/Add Card',
  tags: ['autodocs'],
  decorators: [applicationConfig({ providers: [provideRouter([])] })],
  parameters: { layout: 'fullscreen', a11y: { test: 'todo' } },
};

export default meta;

type Story = StoryObj<WalletAddCard>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Adicionar cartão' })).toBeVisible();
  },
};

export const DarkReducedMotion: Story = {
  ...Playground,
  globals: { ...Playground.globals, theme: 'dark', motion: 'reduced' },
  parameters: { viewport: { defaultViewport: 'mobile' } },
};

export const MobileLight: Story = {
  ...Playground,
  globals: { ...Playground.globals, theme: 'light', motion: 'reduced' },
  parameters: { viewport: { defaultViewport: 'mobile' } },
};
