import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { Event, EventDraft } from '@cacic-fct/event-manager-admin-contracts';
import { fakerPT_BR as faker } from '@faker-js/faker';
import { adminFixtureDateFromNow } from '../../testing/admin-entity-fixtures';
import {
  EventDraftSelectorDialogComponent,
  EventDraftSelectorDialogData,
} from './event-draft-selector-dialog.component';

type EventDraftSelectorStoryArgs = {
  draftCount: number;
  eventName: string;
  draftNamePrefix: string;
  authorName: string;
  expirationOffsetDays: number;
  longContent: boolean;
};

const dialogRefMock = {
  close: () => undefined,
};

const eventFixture: Event = {
  id: 'event-1',
  name: 'Oficina de Publicação',
  creditMinutes: 120,
  startDate: adminFixtureDateFromNow(5),
  endDate: adminFixtureDateFromNow(5, 14),
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
  shouldAllowOralAttendance: false,
  isOnlineAttendanceAllowed: false,
  shouldProvideSubscriberListToLecturer: false,
  onlineAttendanceCode: null,
  onlineAttendanceStartDate: null,
  onlineAttendanceEndDate: null,
  isPubliclyListed: true,
  displayLecturerProfile: true,
  publicationState: 'PUBLISHED',
  scheduledPublishAt: null,
  publishedAt: adminFixtureDateFromNow(-1),
  unpublishedAt: null,
  youtubeCode: null,
  buttonText: null,
  buttonLink: null,
  deletedAt: null,
  createdAt: adminFixtureDateFromNow(-10),
  createdById: 'admin-1',
  updatedAt: adminFixtureDateFromNow(-1),
  updatedById: 'admin-1',
};

function draftFixture(index: number, args: EventDraftSelectorStoryArgs): EventDraft {
  faker.seed(20260816 + args.draftCount * 100 + index);
  const name = `${args.draftNamePrefix.trim() ? `${args.draftNamePrefix.trim()} ` : ''}${
    args.longContent
      ? faker.company.catchPhrase()
      : index === 1
        ? 'Oficina de Publicação revisada'
        : `Variação ${index}`
  }`;
  return {
    id: `draft-${index}`,
    sourceEventId: eventFixture.id,
    name,
    payloadJson: JSON.stringify({
      name,
      startDate: eventFixture.startDate,
      endDate: eventFixture.endDate,
    }),
    createdById: `editor-${index}`,
    createdByName: args.authorName || (index === 1 ? 'Renata Lima' : 'Carlos Souza'),
    createdByEmail: `editor-${index}@example.com`,
    updatedById: `editor-${index}`,
    updatedByName: args.authorName || (index === 1 ? 'Renata Lima' : 'Ana Martins'),
    updatedByEmail: `editor-${index}@example.com`,
    createdAt: adminFixtureDateFromNow(-index, 12),
    updatedAt: adminFixtureDateFromNow(-index, 18),
    expiresAt: adminFixtureDateFromNow(args.expirationOffsetDays, 14),
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
  readonly eventName = input('Oficina de Publicação');
  readonly draftNamePrefix = input('');
  readonly authorName = input('');
  readonly expirationOffsetDays = input(30);
  readonly longContent = input(false);

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            event: { ...eventFixture, name: this.eventName() },
            drafts: Array.from({ length: Math.max(0, Math.min(30, this.draftCount())) }, (_, index) =>
              draftFixture(index + 1, {
                draftCount: this.draftCount(),
                eventName: this.eventName(),
                draftNamePrefix: this.draftNamePrefix(),
                authorName: this.authorName(),
                expirationOffsetDays: this.expirationOffsetDays(),
                longContent: this.longContent(),
              }),
            ),
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
    eventName: 'Oficina de Publicação',
    draftNamePrefix: '',
    authorName: '',
    expirationOffsetDays: 30,
    longContent: false,
  },
  argTypes: {
    draftCount: { control: { type: 'range', min: 0, max: 30, step: 1 } },
    eventName: { control: 'text' },
    draftNamePrefix: { control: 'text' },
    authorName: { control: 'text' },
    expirationOffsetDays: { control: { type: 'range', min: -30, max: 90, step: 1 } },
    longContent: { control: 'boolean' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<EventDraftSelectorStoryArgs>;

export const Playground: Story = {
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

export const DarkReducedMotion: Story = {
  ...SingleDraft,
  globals: { theme: 'dark', motion: 'reduced' },
};

export const Empty: Story = {
  args: { draftCount: 0 },
};

export const DenseDraftHistory: Story = {
  args: { draftCount: 30, expirationOffsetDays: 60 },
};

export const ExpiredDrafts: Story = {
  args: { draftCount: 8, expirationOffsetDays: -1 },
};

export const LongContentMobile: Story = {
  args: {
    draftCount: 12,
    eventName: 'Atividade interdisciplinar de tecnologia, acessibilidade e extensão universitária',
    draftNamePrefix: 'Versão editorial detalhada',
    authorName: 'Mariana Aparecida de Souza Albuquerque dos Santos',
    longContent: true,
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', motion: 'reduced' },
};
