import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { EventPreparationApiService } from '@cacic-fct/shared-angular/event-preparation';
import { createEventPreparationStoryApi } from '@cacic-fct/shared-angular/event-preparation/testing';
import { WorkspacePendingChangesService } from '../app-shell/workspace-pending-changes.service';
import { EventManualNotificationComponent } from './event-manual-notification.component';

const meta: Meta<EventManualNotificationComponent> = {
  title: 'Admin/Event Management/Manual Notification',
  component: EventManualNotificationComponent,
  args: { eventId: 'event-story', eventName: 'Introdução à computação', editable: true, published: true },
  parameters: { layout: 'padded', a11y: { test: 'error' } },
  decorators: [
    applicationConfig({
      providers: [
        { provide: EventPreparationApiService, useFactory: createEventPreparationStoryApi },
        {
          provide: WorkspacePendingChangesService,
          useValue: { register: () => ({ set: () => undefined, destroy: () => undefined }) },
        },
      ],
    }),
  ],
};
export default meta;
type Story = StoryObj<EventManualNotificationComponent>;
export const Compose: Story = {};
export const ReadOnly: Story = { args: { editable: false } };
export const DraftEvent: Story = { args: { published: false } };
export const PreviewAndSend: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByLabelText('Mensagem do aviso'),
      'Em Introdução à computação, a sala mudou para o Laboratório 3. Chegue 15 minutos antes.',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Conferir aviso' }));
    await expect(
      await canvas.findByRole('heading', { name: 'Aviso da organização: Introdução à computação' }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: /^Enviar aviso$/ }));
    await expect(await canvas.findByText(/Aviso agendado/)).toBeVisible();
  },
};
