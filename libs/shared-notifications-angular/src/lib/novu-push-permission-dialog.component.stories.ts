import { NgComponentOutlet } from '@angular/common';
import { Component, Injector, computed, inject, input } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, fn, userEvent, within } from 'storybook/test';
import { withScenarioControls } from '@cacic-fct/shared-angular/storybook';
import { NovuPushPermissionDialogComponent } from './novu-push-permission-dialog.component';

type NovuPushPermissionDialogStoryArgs = {
  closed: ReturnType<typeof fn>;
};

@Component({
  selector: 'lib-storybook-novu-push-permission-dialog-host',
  imports: [NgComponentOutlet],
  template: `<ng-container [ngComponentOutlet]="component" [ngComponentOutletInjector]="storyInjector()" />`,
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
  title: 'Shared/Notifications/Push Permission Dialog',
  tags: ['autodocs'],
  decorators: [withScenarioControls<NovuPushPermissionDialogStoryArgs>()],
  args: {
    closed: fn(),
  },
  argTypes: {
    closed: { table: { disable: true } },
  },
  parameters: {
    controls: { disable: true },
    layout: 'fullscreen',
    a11y: { test: 'error' },
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
