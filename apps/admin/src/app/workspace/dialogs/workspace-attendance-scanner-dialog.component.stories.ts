import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { fakerPT_BR as faker } from '@faker-js/faker';
import type { Decorator, Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { of } from 'rxjs';
import { ScannerFeedbackService } from '@cacic-fct/shared-angular';
import { AttendanceApiService } from '../../graphql/attendance-api.service';
import type { AttendanceCategory, EventAttendance, EventAttendanceScannerFeedItem } from '@cacic-fct/event-manager-admin-contracts';
import { WorkspaceAttendanceScannerDialogComponent } from './workspace-attendance-scanner-dialog.component';

faker.seed(20260616);

type AttendanceScannerStoryArgs = {
  eventId: string;
  feedCount: number;
  category: AttendanceCategory;
};

const dialogRefMock = {
  close: () => undefined,
};

function scannerFeedItem(index: number, eventId: string): EventAttendanceScannerFeedItem {
  return {
    eventId,
    personId: `person-${index + 1}`,
    fullName: faker.person.fullName(),
    unespRole: faker.helpers.arrayElement(['GRADUATION_STUDENT', 'GRADUATE_STUDENT', 'EXTERNAL_COMMUNITY']),
    subscriptionStatus: faker.helpers.arrayElement(['CONFIRMED', 'WAITING_RECEIPT_UPLOAD', null]),
    attendedAt: faker.date.recent({ days: 2 }).toISOString(),
    createdByMethod: index % 2 === 0 ? 'SCANNER' : 'MANUAL_INPUT',
    collectedByFirstName: faker.person.firstName(),
  };
}

function attendance(eventId: string, category: AttendanceCategory): EventAttendance {
  return {
    eventId,
    personId: 'person-created',
    category,
    attendedAt: new Date('2026-05-21T17:15:00.000Z').toISOString(),
    createdAt: new Date('2026-05-21T17:15:00.000Z').toISOString(),
    createdById: 'storybook-admin',
    createdByMethod: 'MANUAL_INPUT',
  };
}

class StoryAttendanceApiService {
  private eventId = 'event-1';
  private category: AttendanceCategory = 'REGULAR';
  private feed: EventAttendanceScannerFeedItem[] = [];

  configure(args: AttendanceScannerStoryArgs): void {
    faker.seed(20260624 + args.feedCount);
    this.eventId = args.eventId;
    this.category = args.category;
    this.feed = Array.from({ length: args.feedCount }, (_, index) => scannerFeedItem(index, args.eventId));
  }

  listEventAttendanceScannerFeed() {
    return of(this.feed);
  }

  watchEventAttendanceScannerFeed() {
    return of(this.feed);
  }

  createEventAttendanceFromScannerCode() {
    return of(attendance(this.eventId, this.category));
  }

  createEventAttendanceFromManualInput() {
    return of(attendance(this.eventId, this.category));
  }
}

const attendanceApi = new StoryAttendanceApiService();

const cameraDeniedDecorator: Decorator = (story) => {
  if (typeof navigator !== 'undefined') {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => Promise.reject(new Error('Permissão negada no Storybook.')),
        enumerateDevices: () => Promise.resolve([]),
      },
    });
  }
  return story();
};

@Component({
  selector: 'app-storybook-attendance-scanner-dialog-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class WorkspaceAttendanceScannerDialogStoryHostComponent {
  private readonly injector = inject(Injector);

  readonly component = WorkspaceAttendanceScannerDialogComponent;
  readonly eventId = input('event-1');

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { eventId: this.eventId() } },
        { provide: MatDialogRef, useValue: dialogRefMock },
        { provide: AttendanceApiService, useValue: attendanceApi },
        { provide: ScannerFeedbackService, useValue: { show: () => undefined } },
      ],
    }),
  );
}

const meta: Meta<AttendanceScannerStoryArgs> = {
  component: WorkspaceAttendanceScannerDialogStoryHostComponent,
  title: 'CACiC Eventos/Workspace/Dialogs/Workspace Attendance Scanner Dialog',
  tags: ['autodocs'],
  decorators: [cameraDeniedDecorator],
  args: {
    eventId: 'event-1',
    feedCount: 5,
    category: 'REGULAR',
  },
  argTypes: {
    eventId: { control: 'text' },
    feedCount: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    category: { control: 'select', options: ['REGULAR', 'NON_PAYING', 'NON_SUBSCRIBED', 'UNKNOWN'] },
  },
  render: (args) => {
    attendanceApi.configure(args);
    return { props: args };
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<AttendanceScannerStoryArgs>;

export const ScannerReady: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Escanear presenças')).toBeVisible();
    await userEvent.type(await canvas.findByLabelText(/e-mail, telefone ou documento/i), 'ana@example.com');
  },
};

export const EmptyFeed: Story = {
  args: {
    feedCount: 0,
  },
  };
