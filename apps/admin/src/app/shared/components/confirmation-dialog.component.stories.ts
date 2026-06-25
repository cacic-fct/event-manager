import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { ConfirmationDialogComponent, ConfirmationDialogData } from './confirmation-dialog.component';

type ConfirmationDialogStoryArgs = {
  title: string;
  message: string;
  includeDetails: boolean;
  tone: ConfirmationDialogData['tone'];
  confirmLabel: string;
  cancelLabel: string;
};

const dialogRefMock = {
  close: () => undefined,
};

const defaultArgs: ConfirmationDialogStoryArgs = {
  title: 'Reemitir todos os certificados?',
  message: 'Esta operação tem escopo global e pode reprocessar arquivos já gerados.',
  includeDetails: true,
  tone: 'danger',
  confirmLabel: 'Reemitir certificados',
  cancelLabel: 'Cancelar',
};

@Component({
  selector: 'app-storybook-confirmation-dialog-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class ConfirmationDialogStoryHostComponent {
  private readonly injector = inject(Injector);

  readonly component = ConfirmationDialogComponent;
  readonly title = input(defaultArgs.title);
  readonly message = input(defaultArgs.message);
  readonly includeDetails = input(defaultArgs.includeDetails);
  readonly tone = input<ConfirmationDialogData['tone']>(defaultArgs.tone);
  readonly confirmLabel = input(defaultArgs.confirmLabel);
  readonly cancelLabel = input(defaultArgs.cancelLabel);

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            title: this.title(),
            message: this.message(),
            details: this.includeDetails()
              ? [
                  'Escopo: todas as configurações de certificado ativas.',
                  'Evite executar durante atendimento, validação ou emissão manual em andamento.',
                ]
              : [],
            tone: this.tone(),
            confirmLabel: this.confirmLabel(),
            cancelLabel: this.cancelLabel(),
          } satisfies ConfirmationDialogData,
        },
        { provide: MatDialogRef, useValue: dialogRefMock },
      ],
    }),
  );
}

const meta: Meta<ConfirmationDialogStoryArgs> = {
  component: ConfirmationDialogStoryHostComponent,
  title: 'CACiC Eventos/Shared/Components/Confirmation Dialog',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    title: { control: 'text' },
    message: { control: 'text' },
    includeDetails: { control: 'boolean' },
    tone: {
      control: 'select',
      options: ['default', 'danger'],
    },
    confirmLabel: { control: 'text' },
    cancelLabel: { control: 'text' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<ConfirmationDialogStoryArgs>;

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await expect(await canvas.findByRole('heading', { name: /certificados|alterações/i })).toBeVisible();
  await userEvent.tab();
  const buttons = canvas.queryAllByRole('button');
  const enabledButton = buttons.find(
    (button) => !button.hasAttribute('disabled') && button.getAttribute('aria-disabled') !== 'true',
  );
  if (enabledButton) {
    await userEvent.hover(enabledButton);
    await expect(enabledButton).toBeVisible();
  }
};

export const Playground: Story = {
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const DefaultTone: Story = {
  args: {
    title: 'Salvar alterações?',
    message: 'Confirme para gravar as alterações deste cadastro.',
    includeDetails: false,
    tone: 'default',
    confirmLabel: 'Salvar alterações',
  },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};
