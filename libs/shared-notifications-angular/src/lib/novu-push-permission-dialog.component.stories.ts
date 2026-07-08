import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { NovuPushPermissionDialogComponent } from './novu-push-permission-dialog.component';

const dialogRefMock = {
  close: () => undefined,
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
  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [{ provide: MatDialogRef, useValue: dialogRefMock }],
    }),
  );
}

const meta: Meta<NovuPushPermissionDialogStoryHostComponent> = {
  component: NovuPushPermissionDialogStoryHostComponent,
  title: 'Shared/Notifications/Novu Push Permission Dialog',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<NovuPushPermissionDialogStoryHostComponent>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Ativar notificações importantes?')).toBeVisible();
    await expect(canvas.getByRole('button', { name: /permitir/i })).toBeVisible();
  },
};

