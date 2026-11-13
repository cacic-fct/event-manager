import { Component, effect, inject, input } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, waitFor, within } from 'storybook/test';
import { UpdateModalComponent, type UpdateProgress } from './update.component';

@Component({
  selector: 'lib-update-story-host',
  template: '',
})
class UpdateStoryHost {
  readonly phase = input<'downloading' | 'ready'>('downloading');
  readonly progress = input<UpdateProgress | null>(null);
  readonly takingLonger = input(false);
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
      ref.componentRef?.setInput('progress', this.progress());
      ref.componentRef?.setInput('takingLonger', this.takingLonger());
      onCleanup(() => ref.close());
    });
  }
}

const meta: Meta<UpdateStoryHost> = {
  component: UpdateStoryHost,
  title: 'Shared/Service Worker/Installing Update Dialog',
  tags: ['autodocs'],
  args: { phase: 'downloading', progress: { completed: 12, total: 40 } },
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
    const title = canvas.getByRole('heading', { name: 'Atualização do aplicativo' });
    await expect(title).toBeVisible();
    await waitFor(() => expect(title).toHaveFocus());
    await expect(title).toHaveStyle({ outlineStyle: 'none' });
    const progress = canvas.getByRole('progressbar', { name: 'Preparação dos arquivos da atualização' });
    await expect(progress).toHaveAttribute('aria-valuenow', '30');
    await expect(progress).toHaveAttribute('aria-valuetext', '12 de 40 arquivos preparados');
    await expect(canvas.getByText('12 de 40 arquivos preparados')).toBeVisible();
  },
};

export const SlowConnection: Story = {
  args: { takingLonger: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByText('Em conexões lentas, esta etapa pode demorar.')).toBeVisible();
    await expect(canvas.getByRole('progressbar')).toBeVisible();
  },
};

export const AwaitingProgress: Story = {
  args: { progress: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByRole('status')).toHaveTextContent('Preparando os arquivos da nova versão.');
    await expect(canvas.queryByRole('progressbar')).not.toBeInTheDocument();
  },
};

export const Reloading: Story = {
  args: { phase: 'ready' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByRole('heading', { name: 'Finalizando atualização' })).toBeVisible();
    await expect(canvas.getByRole('status')).toHaveTextContent('A página será recarregada em instantes.');
    await expect(canvas.queryByRole('progressbar')).not.toBeInTheDocument();
  },
};
