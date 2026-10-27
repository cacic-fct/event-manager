import { withScenarioControls } from '@cacic-fct/shared-angular/storybook';
import type {
  CertificateParticipationStatus,
  EventTargetType,
  PublicEvent,
} from '@cacic-fct/event-manager-public-contracts';
import { PublicDataAccessService, type OfflineAttendanceDetail } from '@cacic-fct/public-indexed-db';
import { RouteErrorService } from '@cacic-fct/shared-angular';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { HttpResponse, delay, http } from 'msw';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { of } from 'rxjs';
import {
  PublicEventStoryControls,
  createPublicStoryEventFromControls,
  createPublicStoryEventGroup,
  createPublicStoryMajorEvent,
  publicEventStoryControlArgTypes,
  publicEventStoryDefaultControls,
} from '../../../testing/public-event-story-fixtures';
import { MoreInfo } from './more-info';

interface MoreInfoStoryArgs extends PublicEventStoryControls {
  targetType: EventTargetType;
  certificateStatus: CertificateParticipationStatus;
  certificateApiState: 'ready' | 'error';
  apiState: 'ready' | 'loading' | 'error';
  latencyMs: number;
  hasAttendance: boolean;
  hasIssuedCertificate: boolean;
  shouldIssueCertificate: boolean;
  certificateCount: number;
  isSubscribed: boolean;
  isLecturer: boolean;
  subscriberCount: number;
  attendanceCount: number;
  onlineAttendanceCode: string;
  canDownloadSubscriberList: boolean;
}

const defaultArgs: MoreInfoStoryArgs = {
  ...publicEventStoryDefaultControls,
  context: 'short-description',
  targetType: 'event',
  certificateStatus: 'ATTENDANCE_CONFIRMED',
  certificateApiState: 'ready',
  apiState: 'ready',
  latencyMs: 120,
  hasAttendance: true,
  hasIssuedCertificate: false,
  shouldIssueCertificate: true,
  certificateCount: 1,
  isSubscribed: true,
  isLecturer: false,
  subscriberCount: 32,
  attendanceCount: 24,
  onlineAttendanceCode: 'ABC123',
  canDownloadSubscriberList: true,
};

interface MoreInfoStoryContext {
  args: MoreInfoStoryArgs;
}

const onlineContext = createStoryContext();
const navigateRouteError = fn(async () => true);

const meta: Meta<MoreInfoStoryArgs> = {
  component: MoreInfo,
  title: 'Public/Profile/Attendance History/Details',
  tags: ['autodocs'],
  decorators: [
    withScenarioControls<MoreInfoStoryArgs>(),
    (story, context) =>
      applicationConfig({
        providers: [
          { provide: RouteErrorService, useValue: { navigate: navigateRouteError } },
          {
            provide: ActivatedRoute,
            useValue: {
              paramMap: of(
                convertToParamMap({
                  eventType: context.args.targetType,
                  eventId: storyTargetId(context.args.targetType),
                }),
              ),
            },
          },
          {
            provide: PublicDataAccessService,
            useValue: {
              replaceAttendanceDetail: async () => undefined,
              getAttendanceDetail: async () =>
                context.globals['network'] === 'offline' ? cachedDetail(context.args) : null,
              getLatestUserSnapshot: async () => ({ userId: 'storybook-user' }),
              purgeUserData: async () => undefined,
            },
          },
        ],
      })(story, context),
  ],
  beforeEach: () => {
    navigateRouteError.mockClear();
  },
  args: defaultArgs,
  argTypes: {
    ...publicEventStoryControlArgTypes,
    context: { control: false, table: { disable: true } },
    targetType: { control: 'inline-radio', options: ['event', 'event-group', 'major-event'] },
    majorEventName: { control: false, table: { disable: true } },
    eventGroupName: { control: false, table: { disable: true } },
    apiState: { control: 'inline-radio', options: ['ready', 'loading', 'error'] },
    latencyMs: { control: { type: 'range', min: 0, max: 2_000, step: 100 } },
    hasAttendance: { control: 'boolean' },
    certificateStatus: {
      control: 'select',
      options: [
        'ATTENDANCE_CONFIRMED',
        'AWAITING_RELEASE',
        'PARTICIPATION_PENDING',
        'ATTENDANCE_UNCONFIRMED',
        'GROUP_ATTENDANCE_INCOMPLETE',
        'ATTENDANCE_UNDER_REVIEW',
        'PAYMENT_PENDING',
        'PAYMENT_UNDER_REVIEW',
        'REGISTRATION_PENDING',
        'RULES_UNDER_REVIEW',
        'NOT_OFFERED',
      ],
    },
    certificateApiState: { control: 'inline-radio', options: ['ready', 'error'] },
    hasIssuedCertificate: { control: 'boolean' },
    shouldIssueCertificate: { control: 'boolean' },
    certificateCount: { control: { type: 'range', min: 0, max: 20, step: 1 }, if: { arg: 'hasIssuedCertificate' } },
    isSubscribed: { control: 'boolean' },
    isLecturer: { control: 'boolean' },
    subscriberCount: { control: { type: 'range', min: 0, max: 5_000, step: 1 }, if: { arg: 'isLecturer' } },
    attendanceCount: { control: { type: 'range', min: 0, max: 5_000, step: 1 }, if: { arg: 'isLecturer' } },
    onlineAttendanceCode: { control: 'text', if: { arg: 'isLecturer' } },
    canDownloadSubscriberList: { control: 'boolean', if: { arg: 'isLecturer' } },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
    ...storyParameters(onlineContext),
  },
  render: (args) => renderStory(args, onlineContext),
};

export default meta;

type Story = StoryObj<MoreInfoStoryArgs>;

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await expect(await canvas.findByRole('heading', { level: 1 })).toBeVisible();
  await userEvent.tab();
  const buttons = canvas.queryAllByRole('button');
  const enabledButton = buttons.find(
    (button) => !button.hasAttribute('disabled') && button.getAttribute('aria-disabled') !== 'true',
  );
  if (enabledButton) {
    await userEvent.hover(enabledButton);
    await expect(enabledButton).toBeVisible();
  }
  const links = canvas.queryAllByRole('link');
  if (links[0]) {
    await expect(links[0]).toBeVisible();
  }
};

export const Playground: Story = {
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const AttendanceOnly: Story = {
  args: {
    isSubscribed: false,
    hasAttendance: true,
    hasIssuedCertificate: false,
    isLecturer: false,
  },
  globals: { network: 'online' },
  play: async ({ canvasElement }) => {
    await exerciseStory(canvasElement);
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('button', { name: 'Registrar presença' })).not.toBeInTheDocument();
    await expect(await canvas.findByText(/Presença registrada/)).toBeVisible();
  },
};

export const OfflineFallback: Story = {
  args: {},
  globals: { network: 'offline' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const WithCertificates: Story = {
  args: { hasIssuedCertificate: true, certificateCount: 6 },
};

export const EventGroupWithCertificates: Story = {
  args: { targetType: 'event-group', hasIssuedCertificate: true, certificateCount: 2 },
};

export const MajorEventWithCertificates: Story = {
  args: { targetType: 'major-event', hasIssuedCertificate: true, certificateCount: 2 },
};

export const AttendanceConfirmed: Story = { args: { certificateStatus: 'ATTENDANCE_CONFIRMED' } };
export const ParticipationPending: Story = {
  args: { hasAttendance: false, certificateStatus: 'PARTICIPATION_PENDING' },
};
export const AttendanceUnconfirmed: Story = {
  args: { hasAttendance: false, certificateStatus: 'ATTENDANCE_UNCONFIRMED' },
};
export const AttendanceUnderReview: Story = {
  args: { hasAttendance: false, certificateStatus: 'ATTENDANCE_UNDER_REVIEW' },
};
export const PaymentPending: Story = { args: { targetType: 'major-event', certificateStatus: 'PAYMENT_PENDING' } };
export const PaymentUnderReview: Story = {
  args: { targetType: 'major-event', certificateStatus: 'PAYMENT_UNDER_REVIEW' },
};
export const RegistrationPending: Story = { args: { certificateStatus: 'REGISTRATION_PENDING' } };
export const GroupAttendanceIncomplete: Story = {
  args: { targetType: 'event-group', certificateStatus: 'GROUP_ATTENDANCE_INCOMPLETE' },
};
export const RulesUnderReview: Story = { args: { targetType: 'event-group', certificateStatus: 'RULES_UNDER_REVIEW' } };
export const CertificateNotOffered: Story = { args: { shouldIssueCertificate: false } };
export const CertificateQueryError: Story = { args: { certificateApiState: 'error' } };
export const PreviouslyIssued: Story = { args: { hasIssuedCertificate: true, shouldIssueCertificate: false } };

export const OrganizerWorkspace: Story = {
  args: {
    isLecturer: true,
    subscriberCount: 320,
    attendanceCount: 248,
    onlineAttendanceCode: 'FCT2026',
    canDownloadSubscriberList: true,
  },
};

export const NoParticipation: Story = {
  args: { isSubscribed: false, hasAttendance: false, hasIssuedCertificate: false, isLecturer: false },
};

export const Loading: Story = {
  args: { apiState: 'loading', latencyMs: 0 },
};

export const LoadError: Story = {
  args: { apiState: 'error', latencyMs: 0 },
  globals: { network: 'online' },
  parameters: {
    docs: { description: { story: 'A failed request with no saved detail redirects to the not-found route.' } },
  },
  play: async () => {
    await waitFor(() => expect(navigateRouteError).toHaveBeenCalledWith(404));
  },
};

export const LongContent: Story = {
  args: {
    name: 'Atividade interdisciplinar de tecnologia, acessibilidade, ciência aberta e transformação social',
    shortDescription:
      'Uma descrição extensa para validar a apresentação de dados de participação em dispositivos móveis.',
    isLecturer: true,
    subscriberCount: 4_250,
    attendanceCount: 3_987,
  },
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
      handlers: {
        graphql: [
          http.post('/api/graphql', async ({ request }) => {
            if (context.args.apiState === 'loading') {
              await delay('infinite');
            }
            if (context.args.latencyMs > 0) {
              await delay(context.args.latencyMs);
            }
            const body = (await request.json()) as { query?: string; variables?: Record<string, unknown> };
            if (
              context.args.apiState === 'error' ||
              (context.args.certificateApiState === 'error' &&
                body.query?.includes('CurrentUserCertificateParticipation'))
            ) {
              return HttpResponse.json({
                errors: [{ message: 'Não foi possível carregar os detalhes da participação.' }],
              });
            }
            return HttpResponse.json({
              data: moreInfoGraphqlData(body.query ?? '', context.args, body.variables ?? {}),
            });
          }),
        ],
      },
    },
  };
}

function moreInfoGraphqlData(query: string, args: MoreInfoStoryArgs, variables: Record<string, unknown> = {}) {
  const event = buildEvent(args);
  const events = [event];
  const targetId = storyTargetId(args.targetType);
  if (query.includes('CurrentUserCertificateParticipation')) {
    return {
      currentUserCertificateParticipation: {
        status: args.shouldIssueCertificate ? args.certificateStatus : 'NOT_OFFERED',
        actionTargetId: 'major-event-story',
      },
    };
  }
  if (query.includes('PublicPrizeDrawAvailability')) {
    return { publicPrizeDrawAvailability: [] };
  }
  if (query.includes('CurrentUserEventForms')) {
    return { currentUserEventForms: [] };
  }
  if (query.includes('CurrentUserMajorEventDetails')) {
    return {
      currentUserMajorEventSubscription: null,
      currentUserMajorEventEventSubscriptions: [],
      currentUserEventAttendances: events.map(currentUserEventAttendance),
      publicEvents: events,
    };
  }

  if (query.includes('CurrentUserMajorEventFeedItem')) {
    return {
      currentUserMajorEventFeed: [
        {
          id: 'major-subscription-story',
          majorEventId: targetId,
          subscriptionStatus: 'CONFIRMED',
          amountPaid: null,
          paymentDate: null,
          paymentTier: null,
          sportsRepresentativeTeams: [],
          majorEvent: event.majorEvent,
          participation: {
            isSubscribed: true,
            isInterested: false,
            isLecturer: false,
            hasIssuedCertificate: args.hasIssuedCertificate,
            isSportsManager: false,
          },
        },
      ],
    };
  }

  if (query.includes('CurrentUserEventGroupDetails')) {
    return {
      currentUserEventGroupSubscription: null,
      currentUserEventAttendances: events.map(currentUserEventAttendance),
      publicEvents: events,
    };
  }

  if (query.includes('CurrentUserEventDetails')) {
    return {
      currentUserEventSubscription: args.isSubscribed
        ? {
            eventId: event.id,
            eventGroupSubscriptionId: null,
            createdAt: event.subscriptionStartDate ?? event.startDate,
            event,
          }
        : null,
      currentUserEventAttendance: args.hasAttendance ? currentUserEventAttendance(event) : null,
      publicEvent: event,
      currentUserCertificates: [],
    };
  }

  if (query.includes('CurrentUserEventSubscriberInformationList')) {
    return { currentUserEventSubscriberInformationList: [] };
  }

  if (query.includes('CurrentUserEventSubscriberInformation')) {
    return {
      currentUserEventSubscriberInformation: args.isSubscribed
        ? { content: 'Confira as orientações da organização antes do evento.' }
        : null,
    };
  }

  if (query.includes('CurrentUserCertificates')) {
    const requestedScope = variables['scope'];
    const isOwnerCertificate =
      args.targetType === 'event'
        ? requestedScope === 'EVENT'
        : args.targetType === 'event-group'
          ? requestedScope === 'EVENT_GROUP'
          : requestedScope === 'MAJOR_EVENT';
    return {
      currentUserCertificates:
        args.hasIssuedCertificate && isOwnerCertificate
          ? Array.from({ length: Math.max(0, Math.min(20, Math.round(args.certificateCount))) }, (_, index) => ({
              id: `certificate-story-${index + 1}`,
              configId: `certificate-config-story-${index + 1}`,
              issuedAt: event.endDate,
              config: {
                id: `certificate-config-story-${index + 1}`,
                name: `Certificado ${index + 1} de ${event.name}`,
                scope: String(requestedScope),
                certificateText: 'Certificado emitido para a atividade de demonstração.',
                certificateTemplate: { id: 'certificate-template-story', name: 'Modelo CACiC' },
              },
              certificateTemplate: { id: 'certificate-template-story', name: 'Modelo CACiC' },
            }))
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
                subscriberCount: args.subscriberCount,
                attendanceCount: args.attendanceCount,
                onlineAttendanceCode: args.onlineAttendanceCode || null,
                canDownloadSubscriberList: args.canDownloadSubscriberList,
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
  if (args.targetType === 'event-group') {
    const eventGroup = createPublicStoryEventGroup({
      id: 'event-group-story',
      name: args.eventGroupName,
      emoji: '✨',
      shouldIssueCertificate: args.shouldIssueCertificate,
      shouldIssueCertificateForEachEvent: false,
      shouldIssuePartialCertificate: true,
    });
    const event = createPublicStoryEventFromControls(
      { ...args, context: 'event-group' },
      {
        id: 'event-group-child-story',
        shouldIssueCertificate: false,
      },
    );
    return {
      ...event,
      majorEvent: null,
      majorEventId: null,
      eventGroup,
      eventGroupId: eventGroup.id,
      shouldIssueCertificate: false,
    };
  }

  if (args.targetType === 'major-event') {
    const majorEvent = createPublicStoryMajorEvent({
      id: 'major-event-story',
      name: args.majorEventName,
      shouldIssueCertificate: args.shouldIssueCertificate,
    });
    const event = createPublicStoryEventFromControls(
      { ...args, context: 'major-event' },
      {
        id: 'major-event-child-story',
        shouldIssueCertificate: false,
      },
    );
    return {
      ...event,
      majorEvent,
      majorEventId: majorEvent.id,
      eventGroup: null,
      eventGroupId: null,
      shouldIssueCertificate: false,
    };
  }

  const event = createPublicStoryEventFromControls(
    { ...args, context: 'short-description' },
    {
      id: 'event-1',
    },
  );
  return { ...event, shouldIssueCertificate: args.shouldIssueCertificate };
}

function cachedDetail(args: MoreInfoStoryArgs): OfflineAttendanceDetail {
  const event = buildEvent(args);
  return {
    eventType: 'event',
    details: {
      subscription: args.isSubscribed
        ? {
            eventId: event.id,
            eventGroupSubscriptionId: null,
            createdAt: event.subscriptionStartDate ?? event.startDate,
            event,
          }
        : null,
      event: args.isSubscribed ? null : event,
      attendance: args.hasAttendance ? currentUserEventAttendance(event) : null,
      hasIssuedCertificate: args.hasIssuedCertificate,
      isLecturer: args.isLecturer,
    },
  };
}

function currentUserEventAttendance(event: PublicEvent) {
  return {
    eventId: event.id,
    attendedAt: event.onlineAttendanceStartDate ?? event.startDate,
    createdAt: event.onlineAttendanceStartDate ?? event.startDate,
    event,
  };
}

function storyTargetId(targetType: EventTargetType): string {
  return targetType === 'event-group'
    ? 'event-group-story'
    : targetType === 'major-event'
      ? 'major-event-story'
      : 'event-1';
}

export const AwaitingCertificates: Story = {
  args: { hasIssuedCertificate: false, shouldIssueCertificate: true },
};

export const IssuanceDisabled: Story = {
  args: { hasIssuedCertificate: false, shouldIssueCertificate: false },
};

export const PreviouslyIssuedCertificates: Story = {
  args: { hasIssuedCertificate: true, shouldIssueCertificate: false, certificateCount: 2 },
};
