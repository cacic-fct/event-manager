import type { EventTargetType } from '@cacic-fct/event-manager-public-contracts/types';
import {
  createPublicEvent,
  createPublicEventGroup,
  createPublicMajorEvent,
  publicFixtureDateFromNow,
} from './public-entity-fixtures';

export interface ParticipationInformationOptions {
  targetType?: EventTargetType;
  subscribed?: boolean;
  attended?: boolean;
  lecturer?: boolean;
  issuedCertificate?: boolean;
  subscriptionStatus?: string;
  eventCount?: number;
  allowSubscription?: boolean;
}

/** A consistent graph for unified pages, HTTP integration tests, stories and browser flows. */
export function createParticipationInformationFixture(options: ParticipationInformationOptions = {}) {
  const targetType = options.targetType ?? 'event';
  const subscribed = options.subscribed ?? true;
  const majorEvent = createPublicMajorEvent({
    id: 'information-major',
    name: 'Encontro de ciência e comunidade',
    startDate: publicFixtureDateFromNow(3, 12),
    endDate: publicFixtureDateFromNow(5, 21),
    isPaymentRequired: true,
    hasEvents: true,
    regularSubscriptionOpen: true,
  });
  const eventGroup = createPublicEventGroup({
    id: 'information-group',
    name: 'Oficinas de tecnologia e criação',
    shouldIssueCertificate: true,
    shouldIssuePartialCertificate: true,
    shouldIssueCertificateForEachEvent: false,
  });
  const names = ['Ideias que transformam o campus', 'Laboratório de projetos abertos', 'Tecnologia para a comunidade'];
  const events = Array.from({ length: options.eventCount ?? (targetType === 'event' ? 1 : 3) }, (_, index) =>
    createPublicEvent({
      id: `information-event-${index + 1}`,
      name: index < names.length ? names[index] : `${names[index % names.length]}, encontro ${index + 1}`,
      emoji: ['💡', '🧪', '🤝'][index % 3],
      startDate: publicFixtureDateFromNow(3 + index, 14),
      endDate: publicFixtureDateFromNow(3 + index, 16),
      description: 'Uma atividade prática para trocar experiências e criar projetos em comunidade.',
      shortDescription: 'Conhecimento e criação em comunidade.',
      locationDescription: 'Laboratório de informática, FCT-Unesp',
      majorEventId: targetType === 'major-event' ? majorEvent.id : null,
      majorEvent: targetType === 'major-event' ? majorEvent : null,
      eventGroupId: targetType === 'event-group' ? eventGroup.id : null,
      eventGroup: targetType === 'event-group' ? eventGroup : null,
      shouldIssueCertificate: targetType === 'event',
      allowSubscription: options.allowSubscription ?? true,
      isOnlineAttendanceAllowed: false,
    }),
  );
  const targetId =
    targetType === 'major-event'
      ? majorEvent.id
      : targetType === 'event-group'
        ? eventGroup.id
        : (events[0]?.id ?? 'information-event-1');
  const eventSubscription = (event: (typeof events)[number]) => ({
    eventId: event.id,
    eventGroupSubscriptionId: targetType === 'event-group' ? 'information-group-subscription' : null,
    createdAt: publicFixtureDateFromNow(-1),
    imageLicenseAgreementAccepted: true,
    event,
  });
  const attendances = options.attended
    ? events.map((event) => ({
        eventId: event.id,
        attendedAt: publicFixtureDateFromNow(),
        event,
      }))
    : [];
  const subscription = subscribed
    ? {
        id: 'information-subscription',
        majorEventId: majorEvent.id,
        majorEvent,
        subscriptionStatus: options.subscriptionStatus ?? 'CONFIRMED',
        amountPaid: 2500,
        paymentDate: null,
        paymentTier: 'Comunidade acadêmica',
        selectedEvents: events,
        notSubscribedEvents: [],
        sportsRepresentativeTeams: [],
      }
    : null;
  return {
    targetType,
    targetId,
    events,
    majorEvent,
    eventGroup,
    subscribed,
    subscription,
    attendances,
    lecturer: options.lecturer ?? false,
    issuedCertificate: options.issuedCertificate ?? false,
    eventSubscription,
  };
}

export type ParticipationInformationFixture = ReturnType<typeof createParticipationInformationFixture>;

/** GraphQL response data shared by MSW and Playwright route interception. */
export function participationInformationGraphqlData(
  query: string,
  variables: Record<string, unknown>,
  fixture: ParticipationInformationFixture,
): Record<string, unknown> {
  const { events, majorEvent, eventGroup, subscribed, subscription, attendances, lecturer } = fixture;
  const event = events.find((item) => item.id === variables['eventId']) ?? events[0];
  const eventSubscription = subscribed && event ? fixture.eventSubscription(event) : null;
  const eventAttendance = attendances.find((item) => item.eventId === event?.id) ?? null;

  if (query.includes('CurrentUserInterestState')) {
    return {
      currentUserInterestState: {
        interest: null,
        subscribed,
        endsAt: event?.endDate ?? null,
        enabled: false,
      },
    };
  }
  if (query.includes('EventMaterials')) {
    return { currentUserEventMaterials: { links: [], updatedAt: null, nextReleaseAt: null } };
  }
  if (query.includes('CurrentUserEventSubscriberInformationList')) {
    return {
      currentUserEventSubscriberInformationList: subscribed
        ? events.map((item) => ({
            eventId: item.id,
            content: 'Leve seu notebook e chegue com dez minutos de antecedência.',
          }))
        : [],
    };
  }
  if (query.includes('CurrentUserEventSubscriberInformation')) {
    return {
      currentUserEventSubscriberInformation: subscribed
        ? {
            content: 'Leve seu notebook e chegue com dez minutos de antecedência.',
          }
        : null,
    };
  }
  if (query.includes('CurrentUserCertificateParticipation')) {
    const status =
      subscription?.subscriptionStatus === 'WAITING_RECEIPT_UPLOAD'
        ? 'PAYMENT_PENDING'
        : subscription?.subscriptionStatus === 'RECEIPT_UNDER_REVIEW'
          ? 'PAYMENT_UNDER_REVIEW'
          : attendances.length > 0
            ? 'ATTENDANCE_CONFIRMED'
            : 'PARTICIPATION_PENDING';
    return { currentUserCertificateParticipation: { status } };
  }
  if (query.includes('CurrentUserCertificates')) {
    return {
      currentUserCertificates: fixture.issuedCertificate
        ? [
            {
              id: 'information-certificate',
              configId: 'information-config',
              issuedAt: publicFixtureDateFromNow(-1),
              config: {
                id: 'information-config',
                name: 'Certificado de participação',
                scope: variables['scope'] ?? 'EVENT',
                certificateText: 'Participação acadêmica',
                certificateTemplate: { id: 'template', name: 'CACiC' },
              },
              certificateTemplate: { id: 'template', name: 'CACiC' },
            },
          ]
        : [],
    };
  }
  if (query.includes('CurrentUserOrganizerInfo')) {
    return {
      currentUserOrganizerInfo: lecturer
        ? {
            targetType: fixture.targetType,
            targetId: fixture.targetId,
            title: event?.name,
            events: events.map((item) => ({
              event: item,
              subscriberCount: 32,
              attendanceCount: 20,
              onlineAttendanceCode: 'FCT2026',
              canDownloadSubscriberList: true,
            })),
          }
        : null,
    };
  }
  if (query.includes('CurrentUserMajorEventFeedItem')) {
    return {
      currentUserMajorEventFeed: [
        {
          id: 'feed-information',
          majorEventId: majorEvent.id,
          majorEvent,
          subscriptionStatus: subscription?.subscriptionStatus ?? null,
          sportsRepresentativeTeams: [],
          participation: {
            isSubscribed: subscribed,
            isInterested: false,
            isLecturer: lecturer,
            hasIssuedCertificate: fixture.issuedCertificate,
            isSportsManager: false,
          },
        },
      ],
    };
  }
  if (query.includes('CurrentUserMajorEventDetails')) {
    return {
      currentUserMajorEventSubscription: subscription,
      currentUserMajorEventEventSubscriptions: subscribed ? events.map(fixture.eventSubscription) : [],
      currentUserEventAttendances: attendances,
      publicEvents: events,
    };
  }
  if (query.includes('CurrentUserEventGroupDetails')) {
    return {
      currentUserEventGroupSubscription: subscribed
        ? {
            id: 'information-group-subscription',
            eventGroupId: eventGroup.id,
            eventGroup,
            events,
            createdAt: publicFixtureDateFromNow(-1),
          }
        : null,
      currentUserEventAttendances: attendances,
      publicEvents: events,
    };
  }
  if (query.includes('CurrentUserEventDetails')) {
    return { currentUserEventSubscription: eventSubscription, currentUserEventAttendance: eventAttendance };
  }
  if (query.includes('CurrentUserMajorEventSubscription')) {
    return { currentUserMajorEventSubscription: subscription };
  }
  if (query.includes('CurrentUserEventForms')) return { currentUserEventForms: [] };
  if (query.includes('PublicPrizeDrawAvailability')) return { publicPrizeDrawAvailability: [] };
  if (query.includes('myTicketPurchaseOptions')) return { myTicketPurchaseOptions: [] };
  if (query.includes('myTicketPurchases')) return { myTicketPurchases: [] };
  if (query.includes('publicMajorEvent(')) return { publicMajorEvent: majorEvent };
  if (query.includes('publicEvents(')) {
    const skip = typeof variables['skip'] === 'number' ? variables['skip'] : 0;
    const take = typeof variables['take'] === 'number' ? variables['take'] : 100;
    return { publicEvents: events.slice(skip, skip + take) };
  }
  if (query.includes('publicEvent(')) {
    return {
      publicEvent: event,
      publicEventSubscriptionSummary: {
        eventId: event?.id,
        hasAvailableSlots: true,
        availableSlots: 18,
        projectedQueuePosition: 1,
      },
      publicEventWeather: null,
      currentUserEventSubscription: eventSubscription,
      currentUserEventAttendance: eventAttendance,
    };
  }
  return {};
}
