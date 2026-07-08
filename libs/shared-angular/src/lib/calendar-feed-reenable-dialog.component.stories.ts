import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import {
  CalendarFeedReenableDialogComponent,
  CalendarFeedReenableDialogData,
} from './calendar-feed-reenable-dialog.component';

type CalendarFeedReenableDialogStoryArgs = CalendarFeedReenableDialogData;

const dialogRefMock = {
  close: () => undefined,
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

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: { feedName: this.feedName() } satisfies CalendarFeedReenableDialogData,
        },
        { provide: MatDialogRef, useValue: dialogRefMock },
      ],
    }),
  );
}

const meta: Meta<CalendarFeedReenableDialogStoryArgs> = {
  component: CalendarFeedReenableDialogStoryHostComponent,
  title: 'Shared/Dialogs/Calendar Feed Reenable Dialog',
  tags: ['autodocs'],
  args: {
    feedName: 'feed pessoal de calendário',
  },
  argTypes: {
    feedName: { control: 'text' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<CalendarFeedReenableDialogStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/reativar feed pessoal/i)).toBeVisible();
    await expect(canvas.getByRole('button', { name: /gerar novo link/i })).toBeVisible();
  },
};

export const SuperAdminFeed: Story = {
  args: {
    feedName: 'feed de super-admins',
  },
};

