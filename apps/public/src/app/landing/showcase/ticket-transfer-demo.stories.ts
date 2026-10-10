import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { TicketTransferDemoComponent } from './ticket-transfer-demo';

const meta: Meta<TicketTransferDemoComponent> = {
  component: TicketTransferDemoComponent,
  title: 'Public/Landing/Demos/Ticket Transfer',
  tags: ['autodocs', 'landing-showcase'],
  decorators: [moduleMetadata({ imports: [TicketTransferDemoComponent] })],
  render: (args) => ({
    props: { incoming: args.incoming },
    template: '<div class="ticket-transfer-story-card"><app-landing-ticket-transfer-demo [incoming]="incoming" /></div>',
    styles: [
      '.ticket-transfer-story-card { background: #23453e; border-radius: 16px; color: #f4fff9; margin: 0 auto; max-width: 650px; padding: 24px; }',
    ],
  }),
  parameters: { controls: { disable: true }, layout: 'fullscreen', a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<TicketTransferDemoComponent>;

export const Playground: Story = {
  args: { incoming: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Marina Costa')).toBeVisible();
    await expect(canvas.getByText('Rafael Almeida')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Enviar bilhete' }));
    await expect(canvas.getByRole('heading', { name: 'Pedido enviado' })).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Pedido enviado' })).toHaveFocus();
    await expect(canvas.getByText('Aguardando resposta.')).toBeVisible();
    await expect(canvas.getByText('Marina Costa')).toBeVisible();
    await expect(canvas.getByText('Rafael Almeida')).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: 'Ver recebimento' }));
    await expect(canvas.getByText('Marina Costa quer transferir este bilhete')).toBeVisible();
    await expect(canvas.getByText('Marina Costa')).toBeVisible();
    await expect(canvas.getByText('Rafael Almeida')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Receber bilhete' }));
    await expect(canvas.getByRole('heading', { name: 'Bilhete recebido' })).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Bilhete recebido' })).toHaveFocus();
    await expect(canvas.getByText('Rafael Almeida')).toBeVisible();
  },
};

export const PendingReply: Story = {
  args: { incoming: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Enviar bilhete' }));
    await expect(canvas.getByRole('heading', { name: 'Pedido enviado' })).toBeVisible();
    await expect(canvas.getByText('Aguardando resposta.')).toBeVisible();
    await expect(canvas.getByText('Rafael Almeida')).toBeVisible();
  },
};

export const IncomingRecipient: Story = {
  args: { incoming: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Marina Costa quer transferir este bilhete')).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Marina Costa quer transferir este bilhete' })).toHaveFocus();
    await expect(canvas.getByText('Marina Costa')).toBeVisible();
    await expect(canvas.getByText('Rafael Almeida')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Receber bilhete' }));
    await expect(canvas.getByRole('heading', { name: 'Bilhete recebido' })).toBeVisible();
    await expect(canvas.getByText('Rafael Almeida')).toBeVisible();
  },
};
