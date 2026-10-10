import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, fn, userEvent, within } from 'storybook/test';
import { TicketAdminReasonDialogComponent, type TicketAdminReasonDialogData } from './ticket-admin-reason-dialog.component';

interface TicketReasonStoryArgs extends TicketAdminReasonDialogData {
  initialReason: string;
}

const meta: Meta<TicketReasonStoryArgs> = {
  component: TicketAdminReasonDialogComponent,
  title: 'CACiC Eventos/Workspace/Tickets/Revocation Reason',
  tags: ['autodocs', 'ticketing'],
  args: {
    title: 'Revogar bilhete',
    actionLabel: 'Revogar bilhete',
    description: 'O bilhete deixará de ser válido. Registre o motivo para auditoria.',
    initialReason: '',
  },
  argTypes: {
    title: { control: 'text' },
    actionLabel: { control: 'text' },
    description: { control: 'text' },
    initialReason: { control: 'text' },
  },
  decorators: [
    (story, context) => applicationConfig({
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: context.args },
        { provide: MatDialogRef, useValue: { close: fn() } },
      ],
    })(story, context),
  ],
  parameters: { layout: 'centered', a11y: { test: 'error' } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const reason = canvas.getByRole('textbox', { name: 'Motivo para auditoria' });
    if (args.initialReason) await userEvent.type(reason, args.initialReason);
    const action = canvas.getByRole('button', { name: args.actionLabel });
    if (args.initialReason.trim()) await expect(action).toBeEnabled();
    else await expect(action).toBeDisabled();
  },
};

export default meta;
type Story = StoryObj<TicketReasonStoryArgs>;

export const Playground: Story = {};

export const BlankReason: Story = {
  args: { initialReason: '   ' },
};

export const CompletedReason: Story = {
  args: { initialReason: 'Cancelamento solicitado pelo titular.' },
};

export const LongReasonOnMobile: Story = {
  args: {
    initialReason: 'O titular solicitou o cancelamento após a conferência de sua inscrição.\nA equipe manteve as movimentações anteriores no histórico para auditoria.',
  },
  globals: { theme: 'dark', motion: 'reduced' },
  parameters: { viewport: { defaultViewport: 'mobile' } },
};
