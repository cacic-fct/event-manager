import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { EventPreparationApiService } from '@cacic-fct/shared-angular/event-preparation';
import { createEventPreparationStoryApi } from '@cacic-fct/shared-angular/event-preparation/testing';
import { PermissionsService } from '../permissions/permissions.service';
import { WorkspacePendingChangesService } from '../app-shell/workspace-pending-changes.service';
import { EventPreparationComponent } from './event-preparation.component';

const meta: Meta<EventPreparationComponent> = {
  title: 'Admin/Event Management/Preparation',
  component: EventPreparationComponent,
  args: { eventId: 'event-story', eventName: 'Introdução à computação', editable: true, published: true },
  parameters: { layout: 'padded', a11y: { test: 'error' } },
  decorators: [
    applicationConfig({
      providers: [
        { provide: EventPreparationApiService, useFactory: createEventPreparationStoryApi },
        { provide: PermissionsService, useValue: { canEdit: () => true } },
        {
          provide: WorkspacePendingChangesService,
          useValue: { register: () => ({ set: () => undefined, destroy: () => undefined }) },
        },
      ],
    }),
  ],
};
export default meta;
type Story = StoryObj<EventPreparationComponent>;
export const EventTeam: Story = {};
export const ReadOnly: Story = { args: { editable: false } };
export const DraftEvent: Story = { args: { published: false } };
