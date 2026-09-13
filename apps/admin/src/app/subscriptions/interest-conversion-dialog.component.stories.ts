import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { InterestConversionDialogComponent, type InterestConversionDialogData } from './interest-conversion-dialog.component';

const meta: Meta<InterestConversionDialogData> = {
  title: 'CACiC Eventos/Workspace/Subscriptions/Interest Conversion',
  component: InterestConversionDialogComponent,
  tags: ['autodocs'],
  args: { personName: 'Ana Clara Silva', targetName: 'Trilha de acessibilidade', requiresImageLicenseAgreement: true },
  argTypes: {
    personName: { control: 'text' },
    targetName: { control: 'text' },
    requiresImageLicenseAgreement: { control: 'boolean' },
  },
  decorators: [(story, context) => applicationConfig({ providers: [
    { provide: MAT_DIALOG_DATA, useValue: context.args },
    { provide: MatDialogRef, useValue: { close: () => undefined } },
  ] })(story, context)],
  parameters: { layout: 'padded', a11y: { test: 'error' } },
};
export default meta;
type Story = StoryObj<InterestConversionDialogData>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const confirm = canvas.getByRole('button', { name: 'Converter em inscrição' });
    await expect(confirm).toBeDisabled();
    await userEvent.click(canvas.getByRole('checkbox'));
    await expect(confirm).toBeEnabled();
  },
};
export const NoConsentRequired: Story = { args: { requiresImageLicenseAgreement: false } };
export const DarkReducedMotion: Story = { globals: { theme: 'dark', motion: 'reduced' }, play: Playground.play };
