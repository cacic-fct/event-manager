import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { fakerPT_BR as faker } from '@faker-js/faker';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import type { AttendanceCategory } from '../../graphql/models';
import { WorkspaceAttendanceInfoDialogComponent } from './workspace-attendance-info-dialog.component';

faker.seed(20260616);

type AttendanceInfoStoryArgs = {
  personName: string;
  eventName: string;
  category: AttendanceCategory;
  createdByMethod: string;
  hasLocation: boolean;
  collectedAccuracyMeters: number;
};

@Component({
  selector: 'app-storybook-attendance-info-dialog-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class WorkspaceAttendanceInfoDialogStoryHostComponent {
  private readonly injector = inject(Injector);

  readonly component = WorkspaceAttendanceInfoDialogComponent;
  readonly personName = input('Ana Clara Silva');
  readonly eventName = input('Arquitetura Angular com Signals');
  readonly category = input<AttendanceCategory>('REGULAR');
  readonly createdByMethod = input('SCANNER');
  readonly hasLocation = input(true);
  readonly collectedAccuracyMeters = input(8);

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            eventId: 'event-story',
            eventName: this.eventName(),
            personId: 'person-story',
            personName: this.personName(),
            attendedAt: '2026-05-21T17:15:00.000Z',
            createdAt: '2026-05-21T17:15:00.000Z',
            createdById: 'collector-story',
            createdByMethod: this.createdByMethod(),
            collectedByFullName: faker.person.fullName(),
            collectedLatitude: this.hasLocation() ? -22.1211 : null,
            collectedLongitude: this.hasLocation() ? -51.4086 : null,
            collectedAccuracyMeters: this.hasLocation() ? this.collectedAccuracyMeters() : null,
            category: this.category(),
          },
        },
      ],
    }),
  );
}

const meta: Meta<AttendanceInfoStoryArgs> = {
  component: WorkspaceAttendanceInfoDialogStoryHostComponent,
  title: 'CACiC Eventos/Workspace/Dialogs/Workspace Attendance Info Dialog',
  tags: ['autodocs'],
  args: {
    personName: 'Ana Clara Silva',
    eventName: 'Arquitetura Angular com Signals',
    category: 'REGULAR',
    createdByMethod: 'SCANNER',
    hasLocation: true,
    collectedAccuracyMeters: 8,
  },
  argTypes: {
    personName: { control: 'text' },
    eventName: { control: 'text' },
    category: { control: 'select', options: ['REGULAR', 'NON_PAYING', 'NON_SUBSCRIBED', 'UNKNOWN'] },
    createdByMethod: { control: 'select', options: ['SCANNER', 'MANUAL_INPUT', 'CSV_IMPORT', 'ONLINE_CODE', 'UNKNOWN'] },
    hasLocation: { control: 'boolean' },
    collectedAccuracyMeters: { control: { type: 'range', min: 0, max: 80, step: 1 } },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<AttendanceInfoStoryArgs>;

export const WithLocation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Detalhes da presença')).toBeVisible();
    await expect(await canvas.findByLabelText('Informações da presença')).toBeVisible();
  },
};

export const WithoutLocation: Story = {
  args: {
    hasLocation: false,
    createdByMethod: 'MANUAL_INPUT',
    collectedAccuracyMeters: 0,
  },
  parameters: {
    viewport: { defaultViewport: 'mobile' },
  },
};
