import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, fn, userEvent, within } from 'storybook/test';
import {
  CalendarFeedReenableChoice,
  CalendarFeedReenableDialogComponent,
  CalendarFeedReenableDialogData,
} from './calendar-feed-reenable-dialog.component';

type CalendarFeedReenableDialogStoryArgs = CalendarFeedReenableDialogData & {
  closed: ReturnType<typeof fn>;
};

@Component({
  selector: 'lib-storybook-calendar-feed-reenable-dialog-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class CalendarFeedReenableDialogStoryHostComponent {
  private readonly injector = inject(Injector);

  readonly component = CalendarFeedReenableDialogComponent;
  readonly feedName = input('feed pessoal de calendário');
  readonly closed = input<(result: CalendarFeedReenableChoice | false | undefined) => void>(() => undefined);

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: { feedName: this.feedName() } satisfies CalendarFeedReenableDialogData,
        },
        {
          provide: MatDialogRef,
          useValue: { close: (result: CalendarFeedReenableChoice | false | undefined) => this.closed()(result) },
        },
      ],
    }),
  );
}

const meta: Meta<CalendarFeedReenableDialogStoryArgs> = {
  component: CalendarFeedReenableDialogStoryHostComponent,
  title: 'CACiC Eventos/Shared/Dialogs/Calendar feed reactivation',
  tags: ['autodocs'],
  args: {
    feedName: 'feed pessoal de calendário',
    closed: fn(),
  },
  argTypes: {
    feedName: { control: 'text', description: 'Nome do feed exibido no aviso de segurança.' },
    closed: { table: { disable: true } },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<CalendarFeedReenableDialogStoryArgs>;

export const Playground: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/reativar feed pessoal/i)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: /gerar novo link/i }));
    await expect(args.closed).toHaveBeenCalledWith('rotate');
  },
};

export const SuperAdminFeed: Story = {
  args: {
    feedName: 'feed de super-admins',
  },
};

export const DarkReducedMotion: Story = {
  args: {
    feedName: 'feed da equipe de organização',
    closed: fn(),
  },
  globals: { theme: 'dark', motion: 'reduced' },
};
