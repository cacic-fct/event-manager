import { Component, effect, inject, input } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, fn, userEvent, within } from 'storybook/test';
import { withScenarioControls } from '../../storybook/scenario-controls.decorator';
import { UpdateErrorDialogComponent } from './update-error.component';

type UpdateErrorDialogStoryArgs = {
  error: string;
  closed: ReturnType<typeof fn>;
};

@Component({
  selector: 'lib-storybook-update-error-dialog-host',
  template: '',
})
class UpdateErrorDialogStoryHostComponent {
  private readonly dialog = inject(MatDialog);
  readonly error = input('O pacote de atualização foi baixado, mas não pôde ser ativado.');
  readonly closed = input<(result: 'reload') => void>(() => undefined);

  constructor() {
    effect((onCleanup) => {
      const closed = this.closed();
      const ref = this.dialog.open(UpdateErrorDialogComponent, {
        data: { error: this.error() },
        width: '480px',
        maxWidth: 'calc(100vw - 32px)',
        disableClose: true,
        autoFocus: 'first-heading',
      });
      const subscription = ref.afterClosed().subscribe((result: 'reload' | undefined) => {
        if (result) closed(result);
      });
      onCleanup(() => {
        subscription.unsubscribe();
        ref.close();
      });
    });
  }
}

const meta: Meta<UpdateErrorDialogStoryArgs> = {
  component: UpdateErrorDialogStoryHostComponent,
  title: 'Shared/Service Worker/Update Error Dialog',
  tags: ['autodocs'],
  decorators: [withScenarioControls<UpdateErrorDialogStoryArgs>()],
  args: {
    error: 'O pacote de atualização foi baixado, mas não pôde ser ativado.',
    closed: fn(),
  },
  argTypes: {
    error: { control: 'text', description: 'Recoverable detail shown when the update fails.' },
    closed: { table: { disable: true } },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<UpdateErrorDialogStoryArgs>;

export const Playground: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByText('Não foi possível atualizar')).toBeVisible();
    await expect(canvas.getByText(args.error)).not.toBeVisible();
    await userEvent.click(canvas.getByText('Detalhes do erro'));
    await expect(canvas.getByText(args.error)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Recarregar' }));
    await expect(args.closed).toHaveBeenCalledWith('reload');
  },
};

export const NetworkFailure: Story = {
  args: {
    error: 'A conexão foi interrompida antes de concluir o download. Verifique sua rede e tente recarregar.',
    closed: fn(),
  },
};
