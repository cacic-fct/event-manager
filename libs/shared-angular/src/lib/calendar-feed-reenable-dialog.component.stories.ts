import { NgComponentOutlet } from '@angular/common';
import { Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, fn, userEvent, within } from 'storybook/test';
import { withScenarioControls } from './storybook/scenario-controls.decorator';
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
  imports: [NgComponentOutlet],
  template: `<ng-container [ngComponentOutlet]="component" [ngComponentOutletInjector]="storyInjector()" />`,
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
  title: 'Shared/Dialogs/Calendar Feed Reactivation',
  tags: ['autodocs'],
  decorators: [withScenarioControls<CalendarFeedReenableDialogStoryArgs>()],
  args: {
    feedName: 'feed pessoal de calendário',
    closed: fn(),
  },
  argTypes: {
    feedName: { control: 'text', description: 'Calendar feed name shown in the security warning.' },
    closed: { table: { disable: true } },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
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
