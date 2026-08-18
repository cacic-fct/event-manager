import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, fn, userEvent, within } from 'storybook/test';
import { UpdateErrorDialogComponent } from './update-error.component';

type UpdateErrorDialogStoryArgs = {
  error: string;
  closed: ReturnType<typeof fn>;
};

@Component({
  selector: 'lib-storybook-update-error-dialog-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class UpdateErrorDialogStoryHostComponent {
  private readonly injector = inject(Injector);

  readonly component = UpdateErrorDialogComponent;
  readonly error = input('O pacote de atualização foi baixado, mas não pôde ser ativado.');
  readonly closed = input<(result: 'reload' | 'unregister') => void>(() => undefined);

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { error: this.error() } },
        {
          provide: MatDialogRef,
          useValue: { close: (result: 'reload' | 'unregister') => this.closed()(result) },
        },
      ],
    }),
  );
}

const meta: Meta<UpdateErrorDialogStoryArgs> = {
  component: UpdateErrorDialogStoryHostComponent,
  title: 'CACiC Eventos/Shared/Service worker/Update error dialog',
  tags: ['autodocs'],
  args: {
    error: 'O pacote de atualização foi baixado, mas não pôde ser ativado.',
    closed: fn(),
  },
  argTypes: {
    error: { control: 'text', description: 'Detalhe recuperável exibido quando a atualização falha.' },
    closed: { table: { disable: true } },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<UpdateErrorDialogStoryArgs>;

export const Playground: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Erro ao atualizar o aplicativo')).toBeVisible();
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

export const DarkReducedMotion: Story = {
  args: {
    error: 'A nova versão não pôde ser ativada neste dispositivo.',
    closed: fn(),
  },
  globals: { theme: 'dark', motion: 'reduced' },
};
