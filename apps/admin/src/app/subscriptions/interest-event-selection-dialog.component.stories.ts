import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { createAdminEvent } from '../testing/admin-entity-fixtures';
import { InterestEventSelectionDialogComponent } from './interest-event-selection-dialog.component';

interface SelectionStoryArgs {
  targetName: string;
  eventCount: number;
}

const meta: Meta<SelectionStoryArgs> = {
  title: 'CACiC Eventos/Workspace/Subscriptions/Interest Activity Selection',
  component: InterestEventSelectionDialogComponent,
  tags: ['autodocs'],
  args: { targetName: 'Semana da Computação', eventCount: 3 },
  argTypes: { targetName: { control: 'text' }, eventCount: { control: { type: 'range', min: 0, max: 8, step: 1 } } },
  decorators: [(story, context) => applicationConfig({ providers: [
    { provide: MAT_DIALOG_DATA, useValue: {
      targetName: context.args.targetName,
      events: Array.from({ length: context.args.eventCount }, (_, index) => createAdminEvent({
        id: `activity-${index}`, name: `Atividade ${index + 1}`,
      })),
    } },
    { provide: MatDialogRef, useValue: { close: () => undefined } },
  ] })(story, context)],
  parameters: { layout: 'padded', a11y: { test: 'error' } },
};
export default meta;
type Story = StoryObj<SelectionStoryArgs>;

export const Playground: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Continuar' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('option', { name: /Atividade 1/ }));
    await expect(canvas.getByRole('button', { name: 'Continuar' })).toBeEnabled();
  },
};
export const NoActivities: Story = { args: { eventCount: 0 } };
export const DarkReducedMotion: Story = { globals: { theme: 'dark', motion: 'reduced' } };
