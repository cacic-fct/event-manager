import { Component, effect, inject, input } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { UpdateModalComponent } from './update.component';

@Component({
  selector: 'lib-update-story-host',
  template: '',
})
class UpdateStoryHost {
  readonly phase = input<'downloading' | 'ready'>('downloading');
  private readonly dialog = inject(MatDialog);

  constructor() {
    effect((onCleanup) => {
      const ref = this.dialog.open(UpdateModalComponent, {
        width: '480px',
        maxWidth: 'calc(100vw - 32px)',
        disableClose: true,
        autoFocus: 'first-heading',
      });
      ref.componentRef?.setInput('phase', this.phase());
      onCleanup(() => ref.close());
    });
  }
}

const meta: Meta<UpdateStoryHost> = {
  component: UpdateStoryHost,
  title: 'Shared/Service Worker/Installing Update Dialog',
  tags: ['autodocs'],
  args: { phase: 'downloading' },
  argTypes: { phase: { control: 'radio', options: ['downloading', 'ready'] } },
  parameters: {
    layout: 'padded',
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<UpdateStoryHost>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByText('Atualização do aplicativo')).toBeVisible();
    await expect(canvas.getByRole('progressbar')).toBeVisible();
  },
};

export const Reloading: Story = {
  args: { phase: 'ready' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByText('Atualização pronta')).toBeVisible();
    await expect(canvas.getByRole('status')).toHaveTextContent('Aguarde um instante.');
  },
};
