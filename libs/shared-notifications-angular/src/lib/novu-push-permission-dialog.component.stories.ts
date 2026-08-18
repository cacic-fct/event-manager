import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, fn, userEvent, within } from 'storybook/test';
import { NovuPushPermissionDialogComponent } from './novu-push-permission-dialog.component';

type NovuPushPermissionDialogStoryArgs = {
  closed: ReturnType<typeof fn>;
};

@Component({
  selector: 'lib-storybook-novu-push-permission-dialog-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class NovuPushPermissionDialogStoryHostComponent {
  private readonly injector = inject(Injector);

  readonly component = NovuPushPermissionDialogComponent;
  readonly closed = input<(result: boolean) => void>(() => undefined);
  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [{ provide: MatDialogRef, useValue: { close: (result: boolean) => this.closed()(result) } }],
    }),
  );
}

const meta: Meta<NovuPushPermissionDialogStoryArgs> = {
  component: NovuPushPermissionDialogStoryHostComponent,
  title: 'CACiC Eventos/Shared/Notifications/Push permission dialog',
  tags: ['autodocs'],
  args: {
    closed: fn(),
  },
  argTypes: {
    closed: { table: { disable: true } },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<NovuPushPermissionDialogStoryArgs>;

export const Playground: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Ativar notificações importantes?')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Agora não' }));
    await expect(args.closed).toHaveBeenCalledWith(false);
  },
};

export const PermissionAccepted: Story = {
  args: {
    closed: fn(),
  },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Permitir' }));
    await expect(args.closed).toHaveBeenCalledWith(true);
  },
};

export const DarkReducedMotion: Story = {
  args: {
    closed: fn(),
  },
  globals: { theme: 'dark', motion: 'reduced' },
};
