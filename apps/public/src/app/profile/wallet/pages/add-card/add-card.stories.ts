import { provideRouter } from '@angular/router';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { WalletAddCard } from './add-card';

const meta: Meta<WalletAddCard> = {
  component: WalletAddCard,
  title: 'Public/Profile/Wallet/Add Card',
  tags: ['autodocs', 'ticketing'],
  decorators: [applicationConfig({ providers: [provideRouter([])] })],
  parameters: {
    controls: { disable: true },
    docs: { description: { component: 'Static wallet card entry page with links to supported registration flows.' } },
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<WalletAddCard>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Adicionar cartão' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Transferência de bilhetes' })).toBeVisible();
  },
};
