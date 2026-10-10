import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { MajorEventSubscriptionDemoComponent } from './major-event-subscription-demo';

const meta: Meta<MajorEventSubscriptionDemoComponent> = {
  component: MajorEventSubscriptionDemoComponent,
  title: 'CACiC Eventos/Landing/Major Event Subscription',
  tags: ['autodocs', 'landing-showcase'],
  parameters: { layout: 'fullscreen', a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<MajorEventSubscriptionDemoComponent>;

export const Playground: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      await expect(canvas.getByRole('checkbox', { name: 'Selecionar Interfaces que incluem' })).toBeChecked();
      await expect(canvas.getByRole('checkbox', { name: 'Selecionar Realidade Virtual' })).toBeChecked();
    }, { timeout: 3000 });
    await expect(canvas.getByText('2 eventos selecionados')).toBeVisible();
  },
};

export const ConfirmedSubscription: Story = {
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Selecionar Interfaces que incluem' }));
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Selecionar Realidade Virtual' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Revisar inscrição' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Confirmar inscrição' }));
    await expect(canvas.getByRole('heading', { name: 'Seu lugar está reservado.' })).toBeVisible();
  },
};

export const MobileReview: Story = {
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'light', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Selecionar Interfaces que incluem' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Revisar inscrição' }));
    await expect(canvas.getByRole('heading', { name: 'Revise sua inscrição' })).toBeVisible();
    await expect(canvas.getByText('Marina Costa')).toBeVisible();
  },
};

export const RestartSubscription: Story = {
  globals: { theme: 'light', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Selecionar Interfaces que incluem' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Revisar inscrição' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Confirmar inscrição' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Recomeçar demonstração' }));
    await expect(canvas.getByRole('checkbox', { name: 'Selecionar Interfaces que incluem' })).not.toBeChecked();
    await expect(canvas.getByRole('button', { name: 'Revisar inscrição' })).toBeDisabled();
  },
};

export const EventInformation: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Informações sobre Interfaces que incluem' }));
    await expect(canvas.getByRole('heading', { name: 'Interfaces que incluem' })).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Auditório' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Voltar à inscrição' }));
    await expect(canvas.getByRole('checkbox', { name: 'Selecionar Interfaces que incluem' })).not.toBeChecked();
  },
};
