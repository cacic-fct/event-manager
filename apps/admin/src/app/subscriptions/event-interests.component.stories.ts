import { publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { applicationConfig } from '@storybook/angular';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { of } from 'rxjs';
import { Permission } from '@cacic-fct/shared-permissions';
import { EventInterestsComponent } from './event-interests.component';
import { InterestEventSelectionDialogComponent } from './interest-event-selection-dialog.component';
import { EventApiService } from '../graphql/event-api.service';
import { EventGroupApiService } from '../graphql/event-group-api.service';
import { InterestApiService } from '../graphql/interest-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { PermissionsService } from '../permissions/permissions.service';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';
import { createAdminEvent, createAdminEventGroup, createAdminMajorEvent } from '../testing/admin-entity-fixtures';

const event = createAdminEvent({
  id: 'interest-event-1',
  name: 'Oficina de acessibilidade',
  emoji: '🧠',
  interestEnabled: true,
});
const group = createAdminEventGroup({
  id: 'interest-group-1',
  name: 'Trilha de acessibilidade',
  emoji: '📚',
  interestEnabled: true,
});
const majorEvent = createAdminMajorEvent({
  id: 'interest-major-1',
  name: 'Semana da Computação',
  emoji: '🎓',
  interestEnabled: true,
});
const interest = {
  id: 'interest-1',
  personId: 'person-1',
  person: { id: 'person-1', name: 'Ana Clara Silva', email: 'ana@example.com' },
  targetType: 'EVENT' as const,
  targetId: event.id,
  eventId: event.id,
  eventGroupId: null,
  majorEventId: null,
  createdAt: publicFixtureDateFromNow(-1),
  updatedAt: publicFixtureDateFromNow(-1),
  createdById: 'person-1',
};

const meta: Meta<EventInterestsComponent> = {
  component: EventInterestsComponent,
  title: 'CACiC Eventos/Workspace/Subscriptions/Quero ir',
  tags: ['autodocs'],
  args: { context: { kind: 'event', id: event.id } },
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: EventApiService,
          useValue: { listEvents: () => of([event]), getEvent: () => of(event) },
        },
        {
          provide: EventGroupApiService,
          useValue: { listEventGroups: () => of([group]), getEventGroup: () => of(group) },
        },
        {
          provide: MajorEventApiService,
          useValue: { listMajorEvents: () => of([majorEvent]), getMajorEvent: () => of(majorEvent) },
        },
        {
          provide: InterestApiService,
          useValue: {
            listInterests: () => of([interest]),
            countInterests: () => of(1),
            convertInterestToSubscription: () => of({ interest, personId: interest.personId }),
          },
        },
        {
          provide: PermissionsService,
          useValue: {
            evaluateWorkspacePermissions: async () => undefined,
            has: (permission: Permission) => [Permission.Subscription.Create, Permission.Event.Read, Permission.EventGroup.Read, Permission.MajorEvent.Read].some((granted) => granted === permission),
          },
        },
        { provide: AdminFeedbackService, useValue: { error: () => undefined } },
        {
          provide: MatDialog,
          useValue: {
            open: (component: unknown) => ({
              afterClosed: () =>
                of(component === InterestEventSelectionDialogComponent ? { selectedEventIds: [event.id] } : { imageLicenseAgreementAccepted: true }),
            }),
          },
        },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
      ],
    }),
  ],
  parameters: { layout: 'fullscreen', a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<EventInterestsComponent>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByRole('heading', { name: 'Interessados' })).resolves.toBeVisible();
    await expect(canvas.findByText('Ana Clara Silva')).resolves.toBeVisible();
    await expect(canvas.findByRole('button', { name: 'Converter em inscrição' })).resolves.toBeVisible();
  },
};

export const ConversionConfirmation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole('button', { name: 'Converter em inscrição' });
    await userEvent.click(button);
    await expect(canvas.findByText('Ana Clara Silva')).resolves.toBeVisible();
  },
};

export const DarkReducedMotion: Story = {
  globals: { theme: 'dark', motion: 'reduced' },
  play: Playground.play,
};

export const CollectionDisabled: Story = {
  decorators: [applicationConfig({ providers: [{
    provide: EventApiService,
    useValue: { listEvents: () => of([{ ...event, interestEnabled: false }]), getEvent: () => of({ ...event, interestEnabled: false }) },
  }] })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText(/Novos interesses desativados/)).resolves.toBeVisible();
  },
};

export const NoScope: Story = { args: { context: null } };
export const GroupScope: Story = { args: { context: { kind: 'group', id: group.id } } };
export const MajorEventScope: Story = { args: { context: { kind: 'major-event', id: majorEvent.id } } };
