import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { NEVER, of, throwError } from 'rxjs';
import { expect, userEvent, within } from 'storybook/test';
import { EventSubscriberInformationComponent } from './event-subscriber-information.component';
import { GraphqlHttpService } from '../graphql/graphql-http.service';
import { PermissionsService } from '../permissions/permissions.service';
import { WorkspacePendingChangesService } from '../app-shell/workspace-pending-changes.service';

type Args = {
  eventId: string;
  editable: boolean;
  published: boolean;
  content: string;
  state: 'ready' | 'loading' | 'error';
};
let active: Args;
const meta: Meta<Args> = {
  title: 'Admin/Event Management/Subscriber Information',
  component: EventSubscriberInformationComponent,
  tags: ['autodocs'],
  args: {
    eventId: 'event-story',
    editable: true,
    published: true,
    content: 'Acesse a [sala do evento](https://example.org/reuniao).\n\n**Entre 10 minutos antes.**',
    state: 'ready',
  },
  argTypes: { state: { control: 'select', options: ['ready', 'loading', 'error'] } },
  parameters: { layout: 'padded', a11y: { test: 'error' } },
  render: (args) => {
    active = args;
    return { props: args };
  },
  decorators: [
    applicationConfig({
      providers: [
        { provide: PermissionsService, useValue: { canEdit: () => true } },
        {
          provide: WorkspacePendingChangesService,
          useValue: { register: () => ({ set: () => undefined, destroy: () => undefined }) },
        },
        {
          provide: GraphqlHttpService,
          useValue: {
            request: (query: string) => {
              if (active.state === 'loading') return NEVER;
              if (active.state === 'error') return throwError(() => new Error('Falha de conexão'));
              return query.includes('mutation')
                ? of({ updateEventSubscriberInformation: { content: active.content } })
                : of({ eventSubscriberInformation: { content: active.content } });
            },
          },
        },
      ],
    }),
  ],
};
export default meta;
type Story = StoryObj<Args>;
export const Published: Story = {};
export const Empty: Story = { args: { content: '' } };
export const ReadOnly: Story = { args: { editable: false } };
export const UnpublishedEvent: Story = { args: { published: false } };
export const Loading: Story = { args: { state: 'loading' } };
export const ConnectionError: Story = { args: { state: 'error' } };
export const PublishAndNotify: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('checkbox', { name: 'Notificar inscritos' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Publicar informações' }));
    await expect(await canvas.findByText('Informações publicadas. Avisos agendados para os inscritos.')).toBeVisible();
    await expect(canvas.getByRole('checkbox')).not.toBeChecked();
  },
};

export const Preview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Pré-visualizar informações para inscritos' }));
    const dialog = within(canvasElement.ownerDocument.body).getByRole('dialog');
    await expect(within(dialog).getByRole('link', { name: 'sala do evento' })).toBeVisible();
  },
};
