import { fakerPT_BR as faker } from '@faker-js/faker';
import {
  createStoryPublicEvent,
  createStoryPublicEventGroup,
  createStoryPublicMajorEvent,
} from '@cacic-fct/event-manager-public-testing';
import { http, HttpResponse } from 'msw';

faker.seed(20260516);

const now = new Date('2026-05-16T12:00:00-03:00');

function isoDaysFromNow(days: number, hour = 14): string {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function publicMajorEvent(index = 0) {
  return createStoryPublicMajorEvent(index, {
    requiresPayment: index % 2 === 0,
    rankedSubscriptionEnabled: true,
  });
}

function publicEvent(index = 0) {
  return createStoryPublicEvent(index, {
    majorEvent: publicMajorEvent(0),
    eventGroup: createStoryPublicEventGroup(index % 2),
    autoSubscribe: index === 0,
  });
}

const events = Array.from({ length: 10 }, (_, index) => publicEvent(index));
const majorEvents = Array.from({ length: 3 }, (_, index) => publicMajorEvent(index));

const currentUserAttendances = events.slice(0, 3).map((event, index) => ({
  eventId: event.id,
  attendedAt: isoDaysFromNow(index - 2, 16),
  createdAt: isoDaysFromNow(index - 2, 16),
}));

const currentUserCertificates = events.slice(0, 2).map((event, index) => ({
  id: `certificate-${index + 1}`,
  configId: `config-${index + 1}`,
  issuedAt: isoDaysFromNow(index - 1, 10),
  config: {
    id: `config-${index + 1}`,
    name: `Certificado ${event.name}`,
    scope: 'EVENT',
    certificateText: faker.lorem.sentence(),
    certificateTemplate: {
      id: 'template-1',
      name: 'Modelo CACiC',
      version: 1,
    },
  },
  certificateTemplate: {
    id: 'template-1',
    name: 'Modelo CACiC',
    version: 1,
  },
}));

const thirdPartyLicensesText = [
  `${faker.company.name()} UI Toolkit`,
  'MIT License',
  '',
  `Copyright (c) 2026 ${faker.company.name()}`,
  '',
  'Mock gerado pelo Storybook para validar a tela de licenças sem depender do arquivo compilado.',
].join('\n');

function currentUserMajorEventSubscription(majorEventId = 'major-1') {
  const majorEvent = majorEvents.find((item) => item.id === majorEventId) ?? majorEvents[0];
  return {
    id: `subscription-${majorEvent.id}`,
    majorEventId: majorEvent.id,
    subscriptionStatus: 'RECEIPT_UNDER_REVIEW',
    amountPaid: 2500,
    paymentDate: null,
    paymentTier: 'STUDENT',
    majorEvent,
    selectedEvents: events.slice(0, 3),
    notSubscribedEvents: events.slice(3, 6),
  };
}

function publicEventById(variables: Record<string, unknown>) {
  return events.find((item) => item.id === variables['eventId']) ?? events[0];
}

function publicMajorEventById(variables: Record<string, unknown>) {
  return majorEvents.find((item) => item.id === variables['majorEventId']) ?? majorEvents[0];
}

function publicEventWeather(event: ReturnType<typeof publicEvent>) {
  return {
    eventId: event.id,
    temperature: 24,
    weatherCode: 1,
    summary: 'Ensolarado',
    materialIcon: 'wb_sunny',
    forecastTime: event.startDate,
    fetchedAt: now.toISOString(),
    attribution: 'Open-Meteo',
  };
}

function certificateDownload(fileName = 'certificado-cacic.pdf') {
  return {
    fileName,
    mimeType: 'application/pdf',
    contentBase64: 'JVBERi0xLjQKJcTl8uXrp/Og0MTGCg==',
  };
}

function graphqlData(query: string, variables: Record<string, unknown>) {
  if (query.includes('publicCalendarEvents')) {
    return { publicCalendarEvents: events };
  }

  if (query.includes('CurrentUserPendingOnlineAttendanceEvents')) {
    return {
      currentUserPendingOnlineAttendanceEvents: events.slice(0, 3).map((event) => ({
        eventId: event.id,
        event,
      })),
    };
  }

  if (query.includes('ConfirmCurrentUserOnlineAttendance')) {
    return {
      confirmCurrentUserOnlineAttendance: {
        eventId: String(variables['eventId'] ?? events[0].id),
        attendedAt: now.toISOString(),
        createdAt: now.toISOString(),
      },
    };
  }

  if (query.includes('publicEvent(')) {
    const event = publicEventById(variables);
    return {
      publicEvent: event,
      publicEventSubscriptionSummary: { eventId: event.id, hasAvailableSlots: true },
      publicEventWeather: publicEventWeather(event),
      publicEvents: events.filter((item) => item.eventGroupId === (variables['eventGroupId'] ?? event.eventGroupId)),
      currentUserEventSubscription: {
        eventId: event.id,
        eventGroupSubscriptionId: null,
        createdAt: isoDaysFromNow(-1, 9),
        event,
      },
      currentUserEventAttendance: currentUserAttendances.find((attendance) => attendance.eventId === event.id) ?? null,
    };
  }

  if (query.includes('publicMajorEvents')) {
    return { publicMajorEvents: majorEvents };
  }

  if (query.includes('PublicMajorEventSubscriptionPage')) {
    const majorEvent = publicMajorEventById(variables);
    return {
      publicMajorEventSubscriptionPage: {
        majorEvent,
        events,
        subscriptionSummaries: events.map((event) => ({ eventId: event.id, hasAvailableSlots: true })),
      },
    };
  }

  if (query.includes('PublicMajorEvent(') || query.includes('publicMajorEvent(')) {
    return { publicMajorEvent: publicMajorEventById(variables) };
  }

  if (query.includes('CurrentUserMajorEventSubscriptions')) {
    return {
      currentUserMajorEventSubscriptions: majorEvents.map((majorEvent) =>
        currentUserMajorEventSubscription(majorEvent.id),
      ),
    };
  }

  if (query.includes('CurrentUserMajorEventSubscription')) {
    return {
      currentUserMajorEventSubscription: currentUserMajorEventSubscription(
        String(variables['majorEventId'] ?? 'major-1'),
      ),
    };
  }

  if (query.includes('UpsertCurrentUserMajorEventSubscription')) {
    return {
      upsertCurrentUserMajorEventSubscription: currentUserMajorEventSubscription(
        String(variables['majorEventId'] ?? 'major-1'),
      ),
    };
  }

  if (query.includes('CurrentUserSubscriptionsFeed')) {
    return {
      currentUserMajorEventFeed: majorEvents.slice(0, 2).map((majorEvent) => ({
        id: `feed-${majorEvent.id}`,
        majorEventId: majorEvent.id,
        subscriptionStatus: 'CONFIRMED',
        amountPaid: 2500,
        paymentDate: isoDaysFromNow(-7, 11),
        paymentTier: 'STUDENT',
        majorEvent,
        participation: {
          isSubscribed: true,
          isLecturer: false,
          hasIssuedCertificate: true,
        },
      })),
      currentUserSubscriptionFeed: {
        items: events.slice(0, 4).map((event) => ({
          type: 'SINGLE_EVENT',
          subscriptionId: `subscription-${event.id}`,
          eventId: event.id,
          date: event.startDate,
          createdAt: isoDaysFromNow(-5, 9),
          event,
          participation: {
            isSubscribed: true,
            isLecturer: event.id === 'event-2',
            hasIssuedCertificate: event.id === 'event-1',
          },
        })),
      },
      currentUserEventAttendances: currentUserAttendances,
    };
  }

  if (query.includes('CurrentUserMajorEventDetails') || query.includes('CurrentUserMajorEventFeedItem')) {
    return {
      currentUserMajorEventSubscription: currentUserMajorEventSubscription(
        String(variables['majorEventId'] ?? 'major-1'),
      ),
      currentUserEventAttendances: currentUserAttendances,
      currentUserMajorEventFeed: [
        {
          id: 'feed-major-1',
          majorEventId: 'major-1',
          subscriptionStatus: 'CONFIRMED',
          amountPaid: 2500,
          paymentDate: isoDaysFromNow(-7, 11),
          paymentTier: 'STUDENT',
          majorEvent: majorEvents[0],
          participation: {
            isSubscribed: true,
            isLecturer: false,
            hasIssuedCertificate: true,
          },
        },
      ],
    };
  }

  if (query.includes('CurrentUserEventDetails')) {
    const event = publicEventById(variables);
    return {
      currentUserEventSubscription: {
        eventId: event.id,
        eventGroupSubscriptionId: null,
        createdAt: isoDaysFromNow(-3, 10),
        event,
      },
      currentUserEventAttendance: currentUserAttendances.find((attendance) => attendance.eventId === event.id) ?? null,
      publicEvent: event,
      currentUserCertificates: currentUserCertificates,
    };
  }

  if (query.includes('CurrentUserEventGroupDetails')) {
    const groupEvents = events.filter((event) => event.eventGroupId === (variables['eventGroupId'] ?? 'group-1'));
    return {
      currentUserEventGroupSubscription: {
        id: 'group-subscription-1',
        eventGroupId: String(variables['eventGroupId'] ?? 'group-1'),
        createdAt: isoDaysFromNow(-4, 10),
        eventGroup: groupEvents[0]?.eventGroup ?? events[0].eventGroup,
        events: groupEvents,
      },
      currentUserEventAttendances: currentUserAttendances,
      publicEvents: groupEvents,
      currentUserCertificates,
    };
  }

  if (query.includes('CurrentUserCertificates')) {
    return { currentUserCertificates };
  }

  if (query.includes('UpsertCurrentUserLecturerProfile')) {
    const input = (variables['input'] ?? {}) as Record<string, unknown>;
    return {
      upsertCurrentUserLecturerProfile: {
        id: 'lecturer-profile-current',
        personId: 'person-current',
        displayName: String(input['displayName'] ?? 'Storybook User'),
        biography: String(input['biography'] ?? ''),
        publishGoogleUserPicture: Boolean(input['publishGoogleUserPicture']),
        googleUserPicture: input['publishGoogleUserPicture'] ? 'https://lh3.googleusercontent.com/a/storybook-user' : null,
        email: input['email'] ?? null,
        whatsapp: input['whatsapp'] ?? null,
      },
    };
  }

  if (query.includes('CurrentUserLecturerProfile')) {
    return {
      currentUserLecturerProfile: {
        id: 'lecturer-profile-current',
        personId: 'person-current',
        displayName: 'Storybook User',
        biography:
          'Ministrante com experiência em desenvolvimento web, comunidade acadêmica e organização de atividades práticas.',
        publishGoogleUserPicture: true,
        googleUserPicture: 'https://lh3.googleusercontent.com/a/storybook-user',
        email: 'storybook@example.com',
        whatsapp: '+5518999999999',
      },
    };
  }

  if (query.includes('DownloadCurrentUserCertificate')) {
    return { downloadCurrentUserCertificate: certificateDownload() };
  }

  if (query.includes('DownloadPublicCertificate')) {
    return { downloadPublicCertificate: certificateDownload('certificado-validado.pdf') };
  }

  if (query.includes('publicCertificateValidation')) {
    return {
      publicCertificateValidation: {
        id: 'certificate-demo',
        personName: faker.person.fullName(),
        targetName: events[0].name,
        issuedAt: now.toISOString(),
        creditMinutes: 120,
        issuerName: 'CACiC FCT',
        certificateText: faker.lorem.sentence(),
      },
    };
  }

  return {};
}

export const publicHandlers = [
  http.post('/api/graphql', async ({ request }) => {
    const body = (await request.json()) as { query?: string; variables?: Record<string, unknown> };
    return HttpResponse.json({ data: graphqlData(body.query ?? '', body.variables ?? {}) });
  }),
  http.get('/ngsw/state', () =>
    HttpResponse.text(`NGSW Debug Info:
Driver state: NORMAL
Latest manifest hash: storybook
Last update check: ${now.toISOString()}`),
  ),
  http.get('/app/ngsw/state', () =>
    HttpResponse.text(`NGSW Debug Info:
Driver state: NORMAL
Latest manifest hash: storybook
Last update check: ${now.toISOString()}`),
  ),
  http.get('/app/3rdpartylicenses.txt', () => HttpResponse.text(thirdPartyLicensesText)),
  http.get('/api/major-event-receipts/major-events/:majorEventId/current', () =>
    HttpResponse.json({
      id: 'receipt-1',
      majorEventId: 'major-1',
      status: 'PENDING',
      originalFileName: 'comprovante.png',
      mimeType: 'image/png',
      sizeBytes: 358400,
      uploadedAt: now.toISOString(),
      reviewedAt: null,
      rejectionReason: null,
    }),
  ),
  http.post('/api/major-event-receipts/major-events/:majorEventId', () =>
    HttpResponse.json({
      id: 'receipt-uploaded',
      majorEventId: 'major-1',
      status: 'PENDING',
      originalFileName: 'novo-comprovante.png',
      mimeType: 'image/png',
      sizeBytes: 420000,
      uploadedAt: now.toISOString(),
      reviewedAt: null,
      rejectionReason: null,
    }),
  ),
  http.all('/api/*', () => HttpResponse.json({ ok: true })),
];
