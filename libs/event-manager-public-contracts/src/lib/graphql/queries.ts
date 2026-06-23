import type {
  CertificateDownload,
  DateTimeString,
  EventType,
  GraphqlVariables,
  PublicCertificateValidation,
  PublicEvent,
  PublicEventSubscriptionSummary,
  PublicEventWeather,
  PublicMajorEvent,
  PublicMajorEventSubscriptionPage,
} from '../types';
import {
  CERTIFICATE_DOWNLOAD_FIELDS,
  PUBLIC_CALENDAR_EVENT_FIELDS,
  PUBLIC_CERTIFICATE_VALIDATION_FIELDS,
  PUBLIC_EVENT_PAGE_FIELDS,
  PUBLIC_EVENT_SUBSCRIPTION_SUMMARY_FIELDS,
  PUBLIC_EVENT_WEATHER_FIELDS,
  PUBLIC_MAJOR_EVENT_CARD_FIELDS,
  PUBLIC_MAJOR_EVENT_SUBSCRIPTION_FIELDS,
  PUBLIC_SUBSCRIPTION_EVENT_FIELDS,
} from './fragments';

export type PublicMajorEventsQueryVariables = GraphqlVariables & {
  query?: string | null;
  startDateFrom?: DateTimeString | null;
  startDateUntil?: DateTimeString | null;
  skip?: number | null;
  take?: number | null;
};

export interface PublicMajorEventsQuery {
  publicMajorEvents: PublicMajorEvent[];
}

export const PUBLIC_MAJOR_EVENTS_QUERY = `
  query PublicMajorEvents(
    $query: String
    $startDateFrom: DateTime
    $startDateUntil: DateTime
    $skip: Int
    $take: Int
  ) {
    publicMajorEvents(
      query: $query
      startDateFrom: $startDateFrom
      startDateUntil: $startDateUntil
      skip: $skip
      take: $take
    ) {
      ${PUBLIC_MAJOR_EVENT_CARD_FIELDS}
    }
  }
`;

export type PublicCalendarEventsQueryVariables = GraphqlVariables & {
  query?: string | null;
  eventType?: EventType | null;
  startDateFrom?: DateTimeString | null;
  startDateUntil?: DateTimeString | null;
};

export interface PublicCalendarEventsQuery {
  publicCalendarEvents: PublicEvent[];
}

export const PUBLIC_CALENDAR_EVENTS_QUERY = `
  query PublicCalendarEvents(
    $query: String
    $eventType: EventType
    $startDateFrom: DateTime
    $startDateUntil: DateTime
  ) {
    publicCalendarEvents(
      query: $query
      eventType: $eventType
      startDateFrom: $startDateFrom
      startDateUntil: $startDateUntil
    ) {
      ${PUBLIC_CALENDAR_EVENT_FIELDS}
    }
  }
`;

export interface PublicEventQueryVariables {
  eventId: string;
}

export interface PublicEventQuery {
  publicEvent: PublicEvent;
}

export const PUBLIC_EVENT_QUERY = `
  query PublicEvent($eventId: String!) {
    publicEvent(id: $eventId) {
      ${PUBLIC_EVENT_PAGE_FIELDS}
    }
  }
`;

export interface PublicEventSubscriptionSummaryQueryVariables {
  eventId: string;
}

export interface PublicEventSubscriptionSummaryQuery {
  publicEventSubscriptionSummary: PublicEventSubscriptionSummary;
}

export const PUBLIC_EVENT_SUBSCRIPTION_SUMMARY_QUERY = `
  query PublicEventSubscriptionSummary($eventId: String!) {
    publicEventSubscriptionSummary(eventId: $eventId) {
      ${PUBLIC_EVENT_SUBSCRIPTION_SUMMARY_FIELDS}
    }
  }
`;

export interface PublicEventWeatherQueryVariables {
  eventId: string;
}

export interface PublicEventWeatherQuery {
  publicEventWeather: PublicEventWeather | null;
}

export const PUBLIC_EVENT_WEATHER_QUERY = `
  query PublicEventWeather($eventId: String!) {
    publicEventWeather(eventId: $eventId) {
      ${PUBLIC_EVENT_WEATHER_FIELDS}
    }
  }
`;

export interface PublicEventPageQueryVariables {
  eventId: string;
}

export interface PublicEventPageQuery {
  publicEvent: PublicEvent;
  publicEventSubscriptionSummary: PublicEventSubscriptionSummary;
  publicEventWeather: PublicEventWeather | null;
}

export const PUBLIC_EVENT_PAGE_QUERY = `
  query PublicEventPage($eventId: String!) {
    publicEvent(id: $eventId) {
      ${PUBLIC_EVENT_PAGE_FIELDS}
    }
    publicEventSubscriptionSummary(eventId: $eventId) {
      ${PUBLIC_EVENT_SUBSCRIPTION_SUMMARY_FIELDS}
    }
    publicEventWeather(eventId: $eventId) {
      ${PUBLIC_EVENT_WEATHER_FIELDS}
    }
  }
`;

export interface PublicMajorEventSubscriptionPageQueryVariables {
  majorEventId: string;
}

export interface PublicMajorEventSubscriptionPageQuery {
  publicMajorEventSubscriptionPage: PublicMajorEventSubscriptionPage;
}

export const PUBLIC_MAJOR_EVENT_SUBSCRIPTION_PAGE_QUERY = `
  query PublicMajorEventSubscriptionPage($majorEventId: String!) {
    publicMajorEventSubscriptionPage(majorEventId: $majorEventId) {
      majorEvent {
        ${PUBLIC_MAJOR_EVENT_SUBSCRIPTION_FIELDS}
      }
      events {
        ${PUBLIC_SUBSCRIPTION_EVENT_FIELDS}
      }
      subscriptionSummaries {
        ${PUBLIC_EVENT_SUBSCRIPTION_SUMMARY_FIELDS}
      }
    }
  }
`;

export interface PublicCertificateValidationQueryVariables {
  certificateId: string;
}

export interface PublicCertificateValidationQuery {
  publicCertificateValidation: PublicCertificateValidation | null;
}

export const PUBLIC_CERTIFICATE_VALIDATION_QUERY = `
  query PublicCertificateValidation($certificateId: String!) {
    publicCertificateValidation(certificateId: $certificateId) {
      ${PUBLIC_CERTIFICATE_VALIDATION_FIELDS}
    }
  }
`;

export interface DownloadPublicCertificateQueryVariables {
  certificateId: string;
}

export interface DownloadPublicCertificateQuery {
  downloadPublicCertificate: CertificateDownload;
}

export const DOWNLOAD_PUBLIC_CERTIFICATE_QUERY = `
  query DownloadPublicCertificate($certificateId: String!) {
    downloadPublicCertificate(certificateId: $certificateId) {
      ${CERTIFICATE_DOWNLOAD_FIELDS}
    }
  }
`;
