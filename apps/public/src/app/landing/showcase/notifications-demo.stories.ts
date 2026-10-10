import type { Meta, StoryObj } from '@storybook/angular';
import { expect, fn, userEvent, within } from 'storybook/test';
import { NotificationsDemoComponent } from './notifications-demo';

const destinationOpened = fn();

const meta: Meta<NotificationsDemoComponent> = {
  component: NotificationsDemoComponent,
  title: 'Public/Landing/Demos/Notifications',
  tags: ['autodocs', 'landing-showcase'],
  render: () => ({
    props: { destinationOpened },
    template: '<app-landing-notifications-demo (openDestination)="destinationOpened($event)" />',
  }),
  parameters: { controls: { disable: true }, a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<NotificationsDemoComponent>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Falta enviar seu comprovante' }));
    await expect(destinationOpened).toHaveBeenCalledWith('receipt');
  },
};

export const AllRead: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Marcar todas como lidas' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Não lidas' }));
    await expect(canvas.getByRole('status')).toHaveTextContent('Tudo em dia.');
  },
};

export const CertificateShortcut: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Seu certificado está disponível' }));
    await expect(destinationOpened).toHaveBeenCalledWith('certificates');
  },
};
