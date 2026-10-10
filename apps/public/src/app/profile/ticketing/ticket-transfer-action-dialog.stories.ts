import { withScenarioControls } from '@cacic-fct/shared-angular/storybook';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { expect, within } from 'storybook/test';
import { TicketTransferActionDialog } from './ticket-transfer-action-dialog';

type TicketTransferActionDialogStoryArgs = {
  action: 'accept' | 'ignore';
  ticketName: string;
};

const meta: Meta<TicketTransferActionDialogStoryArgs> = {
  component: TicketTransferActionDialog,
  title: 'Public/Ticketing/Transfers/Confirmation',
  tags: ['autodocs', 'ticketing'],
  parameters: { layout: 'centered', a11y: { test: 'error' } },
  args: { action: 'accept', ticketName: 'Festa de encerramento' },
  argTypes: {
    action: { control: 'select', options: ['accept', 'ignore'] },
    ticketName: { control: 'text' },
  },
  decorators: [
    withScenarioControls<TicketTransferActionDialogStoryArgs>(),
    (story, context) =>
      applicationConfig({
        providers: [
          { provide: MAT_DIALOG_DATA, useValue: { action: context.args.action, ticketName: context.args.ticketName } },
          { provide: MatDialogRef, useValue: { close: () => undefined } },
        ],
      })(story, context),
  ],
};

export default meta;

type Story = StoryObj<TicketTransferActionDialogStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/será transferido para você/i)).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Receber bilhete' })).toBeVisible();
  },
};

export const Ignore: Story = {
  args: { action: 'ignore' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/não poderá ser reaberto/i)).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Ignorar pedido' })).toBeVisible();
  },
};

export const LongTicketName: Story = {
  args: { ticketName: 'Credencial de participação da conferência de acessibilidade e tecnologia' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Credencial de participação da conferência de acessibilidade/)).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Receber bilhete' })).toBeVisible();
  },
};
