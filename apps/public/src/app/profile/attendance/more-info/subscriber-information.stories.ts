import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { NEVER, of, throwError } from 'rxjs';
import { expect, within } from 'storybook/test';
import { AttendancesApiService } from '../attendances-api.service';
import { SubscriberInformation } from './subscriber-information';

type Args = {
  eventId: string;
  eventName: string;
  markdown: string;
  state: 'ready' | 'loading' | 'error' | 'unavailable';
};
let active: Args;
const meta: Meta<Args> = {
  title: 'Public/Profile/Attendance History/Subscriber Information',
  component: SubscriberInformation,
  tags: ['autodocs'],
  args: {
    eventId: 'event-story',
    eventName: '',
    state: 'ready',
    markdown: 'Participe pela [sala de reunião](https://example.org/reuniao).\n\n**Entre com seu nome completo.**',
  },
  argTypes: { state: { control: 'select', options: ['ready', 'loading', 'error', 'unavailable'] } },
  parameters: { layout: 'padded', a11y: { test: 'error' } },
  render: (args) => {
    active = args;
    return { props: args };
  },
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: AttendancesApiService,
          useValue: {
            getSubscriberInformation: () =>
              active.state === 'loading'
                ? NEVER
                : active.state === 'error'
                  ? throwError(() => new Error('Sem conexão'))
                  : of(active.state === 'unavailable' ? null : active.markdown),
          },
        },
      ],
    }),
  ],
};
export default meta;
type Story = StoryObj<Args>;
export const AccessInstructions: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('link', { name: 'sala de reunião' })).toHaveAttribute(
      'href',
      'https://example.org/reuniao',
    );
  },
};
export const WithinEventGroup: Story = { args: { eventName: 'Introdução à computação' } };
export const NoPublishedContent: Story = { args: { markdown: '' } };
export const NotSubscribed: Story = { args: { state: 'unavailable' } };
export const Loading: Story = { args: { state: 'loading' } };
export const ConnectionError: Story = { args: { state: 'error' } };
