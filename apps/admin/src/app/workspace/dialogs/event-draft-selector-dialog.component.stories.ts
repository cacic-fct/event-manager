import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { Event, EventDraft } from '../../graphql/models';
import {
  EventDraftSelectorDialogComponent,
  EventDraftSelectorDialogData,
} from './event-draft-selector-dialog.component';

type EventDraftSelectorStoryArgs = {
  draftCount: number;
};

const dialogRefMock = {
  close: () => undefined,
};

const eventFixture: Event = {
  id: 'event-1',
  name: 'Oficina de Publicação',
  creditMinutes: 120,
  startDate: '2026-07-20T12:00:00.000Z',
  endDate: '2026-07-20T14:00:00.000Z',
  emoji: '🗓️',
  type: 'MINICURSO',
  description: 'Evento publicado.',
  shortDescription: 'Resumo publicado.',
  latitude: null,
  longitude: null,
  locationDescription: 'Auditório',
  majorEventId: null,
  majorEvent: null,
  eventGroupId: null,
  eventGroup: null,
  allowSubscription: true,
  subscriptionStartDate: null,
  subscriptionEndDate: null,
  slots: 40,
  autoSubscribe: false,
  shouldIssueCertificate: true,
  shouldIssueCertificateForNonPayingAttendees: false,
  shouldIssueCertificateForNonSubscribedAttendees: false,
  shouldCollectAttendance: true,
  isOnlineAttendanceAllowed: false,
  shouldProvideSubscriberListToLecturer: false,
  onlineAttendanceCode: null,
  onlineAttendanceStartDate: null,
  onlineAttendanceEndDate: null,
  publiclyVisible: true,
  publicationState: 'PUBLISHED',
  scheduledPublishAt: null,
  publishedAt: '2026-06-20T12:00:00.000Z',
  unpublishedAt: null,
  youtubeCode: null,
  buttonText: null,
  buttonLink: null,
  deletedAt: null,
  createdAt: '2026-06-10T12:00:00.000Z',
  createdById: 'admin-1',
  updatedAt: '2026-06-20T12:00:00.000Z',
  updatedById: 'admin-1',
};

function draftFixture(index: number): EventDraft {
  return {
    id: `draft-${index}`,
    sourceEventId: eventFixture.id,
    name: index === 1 ? 'Oficina de Publicação revisada' : `Variação ${index}`,
    payloadJson: JSON.stringify({
      name: index === 1 ? 'Oficina de Publicação revisada' : `Variação ${index}`,
      startDate: eventFixture.startDate,
      endDate: eventFixture.endDate,
    }),
    createdById: `editor-${index}`,
    createdByName: index === 1 ? 'Renata Lima' : 'Carlos Souza',
    createdByEmail: `editor-${index}@example.com`,
    updatedById: `editor-${index}`,
    updatedByName: index === 1 ? 'Renata Lima' : 'Ana Martins',
    updatedByEmail: `editor-${index}@example.com`,
    createdAt: `2026-06-2${index}T12:00:00.000Z`,
    updatedAt: `2026-06-2${index}T18:30:00.000Z`,
    expiresAt: `2026-08-19T14:00:00.000Z`,
  };
}

@Component({
  selector: 'app-storybook-event-draft-selector-dialog-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class EventDraftSelectorDialogStoryHostComponent {
  private readonly injector = inject(Injector);

  readonly component = EventDraftSelectorDialogComponent;
  readonly draftCount = input(2);

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            event: eventFixture,
            drafts: Array.from({ length: this.draftCount() }, (_, index) => draftFixture(index + 1)),
          } satisfies EventDraftSelectorDialogData,
        },
        { provide: MatDialogRef, useValue: dialogRefMock },
      ],
    }),
  );
}

const meta: Meta<EventDraftSelectorStoryArgs> = {
  component: EventDraftSelectorDialogStoryHostComponent,
  title: 'CACiC Eventos/Workspace/Dialogs/Event Draft Selector Dialog',
  tags: ['autodocs'],
  args: {
    draftCount: 2,
  },
  argTypes: {
    draftCount: { control: { type: 'number', min: 1, max: 4, step: 1 } },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<EventDraftSelectorStoryArgs>;

export const MultipleDrafts: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Escolher versão para edição' })).toBeVisible();
    await expect(await canvas.findByText('Evento publicado')).toBeVisible();
    await expect(await canvas.findByText(/Rascunho:/)).toBeVisible();
    await userEvent.tab();
  },
};

export const SingleDraft: Story = {
  args: {
    draftCount: 1,
  },
};
