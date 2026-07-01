import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import { HttpResponse, http } from 'msw';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import {
  PublicEventStoryControls,
  createPublicStoryEventFromControls,
  publicEventStoryControlArgTypes,
  publicEventStoryDefaultControls,
} from '../../../testing/public-event-story-fixtures';
import { MoreInfo } from './more-info';

interface MoreInfoStoryArgs extends PublicEventStoryControls {
  hasAttendance: boolean;
  hasIssuedCertificate: boolean;
  isLecturer: boolean;
}

const defaultArgs: MoreInfoStoryArgs = {
  ...publicEventStoryDefaultControls,
  hasAttendance: true,
  hasIssuedCertificate: false,
  isLecturer: false,
};

interface MoreInfoStoryContext {
  args: MoreInfoStoryArgs;
}

const meta: Meta<MoreInfoStoryArgs> = {
  component: MoreInfo,
  title: 'Public/Profile/Attendances/More Info/More Info',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    ...publicEventStoryControlArgTypes,
    hasAttendance: { control: 'boolean' },
    hasIssuedCertificate: { control: 'boolean' },
    isLecturer: { control: 'boolean' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<MoreInfoStoryArgs>;

const onlineContext = createStoryContext();

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await userEvent.tab();
  const buttons = canvas.queryAllByRole('button');
  const enabledButton = buttons.find((button) => !button.hasAttribute('disabled') && button.getAttribute('aria-disabled') !== 'true');
  if (enabledButton) {
    await userEvent.hover(enabledButton);
    await expect(enabledButton).toBeVisible();
  }
  const links = canvas.queryAllByRole('link');
  if (links[0]) {
    await expect(links[0]).toBeVisible();
  }
};

export const Online: Story = {
  render: (args) => renderStory(args, onlineContext),
  parameters: storyParameters(onlineContext),
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OfflineFallback: Story = {
  args: {},
  globals: { theme: 'light', network: 'offline' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

function createStoryContext(args: Partial<MoreInfoStoryArgs> = {}): MoreInfoStoryContext {
  return {
    args: { ...defaultArgs, ...args },
  };
}

function renderStory(args: MoreInfoStoryArgs, context: MoreInfoStoryContext) {
  context.args = { ...defaultArgs, ...args };
  return { props: {} };
}

function storyParameters(context: MoreInfoStoryContext) {
  return {
    msw: {
      handlers: [
        http.post('/api/graphql', async ({ request }) => {
          const body = (await request.json()) as { query?: string };
          return HttpResponse.json({ data: moreInfoGraphqlData(body.query ?? '', context.args) });
        }),
      ],
    },
  };
}

function moreInfoGraphqlData(query: string, args: MoreInfoStoryArgs) {
  const event = buildEvent(args);
  if (query.includes('CurrentUserEventDetails')) {
    return {
      currentUserEventSubscription: {
        eventId: event.id,
        eventGroupSubscriptionId: null,
        createdAt: event.subscriptionStartDate ?? event.startDate,
        event,
      },
      currentUserEventAttendance: args.hasAttendance ? currentUserEventAttendance(event) : null,
      publicEvent: event,
      currentUserCertificates: [],
    };
  }

  if (query.includes('CurrentUserCertificates')) {
    return {
      currentUserCertificates: args.hasIssuedCertificate
        ? [
            {
              id: 'certificate-story',
              configId: 'certificate-config-story',
              issuedAt: event.endDate,
              config: {
                id: 'certificate-config-story',
                name: `Certificado ${event.name}`,
                scope: 'EVENT',
                certificateText: 'Certificado emitido para a atividade de demonstração.',
                certificateTemplate: {
                  id: 'certificate-template-story',
                  name: 'Modelo CACiC',
                  version: 1,
                },
              },
              certificateTemplate: {
                id: 'certificate-template-story',
                name: 'Modelo CACiC',
                version: 1,
              },
            },
          ]
        : [],
    };
  }

  if (query.includes('CurrentUserOrganizerInfo')) {
    return {
      currentUserOrganizerInfo: args.isLecturer
        ? {
            targetType: 'event',
            targetId: event.id,
            title: event.name,
            events: [
              {
                event,
                subscriberCount: 32,
                attendanceCount: 24,
                onlineAttendanceCode: 'ABC123',
                canDownloadSubscriberList: true,
              },
            ],
          }
        : null,
    };
  }

  if (query.includes('publicEvent(')) {
    return { publicEvent: event };
  }

  if (query.includes('DownloadCurrentUserCertificate')) {
    return {
      downloadCurrentUserCertificate: {
        fileName: 'certificado-cacic.pdf',
        mimeType: 'application/pdf',
        contentBase64: 'JVBERi0xLjQKJcTl8uXrp/Og0MTGCg==',
      },
    };
  }

  return {};
}

function buildEvent(args: MoreInfoStoryArgs): PublicEvent {
  return createPublicStoryEventFromControls(args, {
    id: 'event-1',
    shouldIssueCertificate: true,
  });
}

function currentUserEventAttendance(event: PublicEvent) {
  return {
    eventId: event.id,
    attendedAt: event.onlineAttendanceStartDate ?? event.startDate,
    createdAt: event.onlineAttendanceStartDate ?? event.startDate,
  };
}
