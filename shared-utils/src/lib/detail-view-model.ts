import {
  compareIsoDateAsc,
  formatCreditMinutes,
  formatCurrency,
  formatDateRange,
  formatDateTime,
  formatDay,
  formatEventsDateRange,
  getAttendanceByEventId,
  getContactLabel,
  getEventGroupCertificateLabel,
  getEventTypeLabel,
  getSubscriptionStatusLabel,
  isOnlineAttendanceRegistrationOpen,
  joinUnique,
} from './attendance-formatters';
import {
  CertificateTarget,
  CurrentUserEventAttendance,
  CurrentUserMajorEventSubscription,
  DetailEventItem,
  DetailViewModel,
  EventDetails,
  EventGroupDetails,
  EventTargetType,
  InfoRow,
  MajorEventDetails,
  PublicEvent,
  PublicEventGroup,
  PublicMajorEvent,
} from './attendance-models';

type DetailViewModelInput =
  | { eventType: 'event'; details: EventDetails }
  | { eventType: 'event-group'; details: EventGroupDetails }
  | { eventType: 'major-event'; details: MajorEventDetails };

export function parseEventTargetType(
  value: string | null,
): EventTargetType | null {
  if (value === 'event' || value === 'event-group' || value === 'major-event') {
    return value;
  }

  return null;
}

export function buildDetailViewModel(
  input: DetailViewModelInput,
): DetailViewModel | null {
  switch (input.eventType) {
    case 'event':
      return buildEventDetail(input.details);
    case 'event-group':
      return buildEventGroupDetail(input.details);
    case 'major-event':
      return buildMajorEventDetail(input.details);
  }
}

export function buildEventDetail(
  details: EventDetails,
): DetailViewModel | null {
  const subscription = details.subscription;
  const event = subscription?.event ?? details.event;
  if (!event || (!subscription && !details.hasIssuedCertificate)) {
    return null;
  }

  const isSubscribed = Boolean(subscription);
  const eventItem = buildEventItem(event, details.attendance, isSubscribed);

  return {
    targetType: 'event',
    typeLabel: getEventTypeLabel(event.type),
    title: event.name,
    emoji: event.emoji,
    dateLine: eventItem.dateLine,
    description: event.description ?? event.shortDescription,
    location: event.locationDescription,
    statusLabel: getDetailStatusLine(eventItem, details.hasIssuedCertificate),
    infoRows: eventInfoRows(event, isSubscribed ? eventItem.statusLine : null),
    events: [eventItem],
    notSubscribedEvents: [],
    certificateTargets:
      event.shouldIssueCertificate || details.hasIssuedCertificate
        ? [{ scope: 'EVENT', targetId: event.id }]
        : [],
    shouldIssueCertificate: Boolean(
      event.shouldIssueCertificate || details.hasIssuedCertificate,
    ),
    buttonText: event.buttonText,
    buttonLink: event.buttonLink,
  };
}

export function buildEventGroupDetail(
  details: EventGroupDetails,
): DetailViewModel | null {
  const subscription = details.subscription;
  const eventGroup = subscription?.eventGroup ?? details.eventGroup;
  const rawEvents = subscription?.events ?? details.events ?? [];
  if (!eventGroup || (!subscription && !details.hasIssuedCertificate)) {
    return null;
  }

  const attendanceByEventId = getAttendanceByEventId(details.attendances);
  const isSubscribed = Boolean(subscription);
  const events = sortEvents(rawEvents);
  const eventItems = events.map((event) =>
    buildEventItem(event, attendanceByEventId.get(event.id), isSubscribed),
  );
  const certificateTargets = getEventGroupCertificateTargets(
    eventGroup,
    events,
  );
  if (certificateTargets.length === 0 && details.hasIssuedCertificate) {
    certificateTargets.push({ scope: 'EVENT_GROUP', targetId: eventGroup.id });
  }

  return {
    targetType: 'event-group',
    typeLabel: 'Grupo de eventos',
    title: eventGroup.name,
    emoji: eventGroup.emoji,
    dateLine: formatEventsDateRange(events),
    description: joinUnique(
      events
        .map((event) => event.shortDescription ?? event.description)
        .filter((description): description is string => Boolean(description)),
    ),
    location: joinUnique(
      events
        .map((event) => event.locationDescription)
        .filter((location): location is string => Boolean(location)),
    ),
    statusLabel: isSubscribed
      ? getGroupedStatusLine(eventItems)
      : 'Certificado emitido',
    infoRows: eventGroupInfoRows(eventGroup, events),
    events: eventItems,
    notSubscribedEvents: [],
    certificateTargets,
    shouldIssueCertificate: certificateTargets.length > 0,
  };
}

export function buildMajorEventDetail(
  details: MajorEventDetails,
): DetailViewModel | null {
  const subscription = details.subscription;
  const majorEvent = subscription?.majorEvent ?? details.majorEvent;
  if (!majorEvent || (!subscription && !details.hasIssuedCertificate)) {
    return null;
  }

  const selectedEvents = sortEvents(subscription?.selectedEvents ?? []);
  const notSubscribedEvents = sortEvents(
    subscription?.notSubscribedEvents ?? [],
  );
  const attendanceByEventId = getAttendanceByEventId(details.attendances);
  const eventItems = selectedEvents.map((event) =>
    buildEventItem(event, attendanceByEventId.get(event.id), true),
  );
  const notSubscribedEventItems = notSubscribedEvents.map((event) =>
    buildEventItem(event, attendanceByEventId.get(event.id), false),
  );

  return {
    targetType: 'major-event',
    typeLabel: 'Grande evento',
    title: majorEvent.name,
    emoji: majorEvent.emoji,
    dateLine: formatDateRange(majorEvent.startDate, majorEvent.endDate),
    description: majorEvent.description,
    statusLabel: subscription
      ? getSubscriptionStatusLabel(subscription.subscriptionStatus)
      : 'Certificado emitido',
    infoRows: majorEventInfoRows(majorEvent, subscription),
    events: eventItems,
    notSubscribedEvents: notSubscribedEventItems,
    certificateTargets:
      majorEvent.shouldIssueCertificate || details.hasIssuedCertificate
        ? [{ scope: 'MAJOR_EVENT', targetId: majorEvent.id }]
        : [],
    shouldIssueCertificate: Boolean(
      majorEvent.shouldIssueCertificate || details.hasIssuedCertificate,
    ),
    buttonText: majorEvent.buttonText,
    buttonLink: majorEvent.buttonLink,
  };
}

export function buildEventItem(
  event: PublicEvent,
  attendance: CurrentUserEventAttendance | null | undefined,
  isSubscribed: boolean,
): DetailEventItem {
  const statusLine = attendance
    ? `Presença registrada às ${formatDateTime(attendance.attendedAt)}`
    : isSubscribed
      ? 'Sem presença registrada'
      : 'Não inscrito';

  return {
    event,
    dateLine: formatDateRange(event.startDate, event.endDate),
    statusLine,
    canRegisterAttendance:
      !attendance && isOnlineAttendanceRegistrationOpen(event),
  };
}

export function getEventGroupCertificateTargets(
  group: PublicEventGroup,
  events: PublicEvent[],
): CertificateTarget[] {
  const targets: CertificateTarget[] = [];

  if (group.shouldIssuePartialCertificate) {
    targets.push({ scope: 'EVENT_GROUP', targetId: group.id });
  }

  if (group.shouldIssueCertificateForEachEvent) {
    for (const event of events) {
      if (event.shouldIssueCertificate) {
        targets.push({ scope: 'EVENT', targetId: event.id });
      }
    }
  }

  if (
    targets.length === 0 &&
    group.shouldIssueCertificate &&
    !group.shouldIssueCertificateForEachEvent
  ) {
    targets.push({ scope: 'EVENT_GROUP', targetId: group.id });
  }

  return targets;
}

function getDetailStatusLine(
  eventItem: DetailEventItem,
  hasIssuedCertificate: boolean | undefined,
): string {
  if (eventItem.statusLine !== 'Não inscrito') {
    return eventItem.statusLine;
  }

  return hasIssuedCertificate ? 'Certificado emitido' : eventItem.statusLine;
}

function eventInfoRows(
  event: PublicEvent,
  statusLine: string | null,
): InfoRow[] {
  return cleanRows([
    statusLine ? { label: 'Status', value: statusLine } : undefined,
    {
      label: 'Data',
      value: formatDateRange(event.startDate, event.endDate),
    },
    { label: 'Tipo', value: getEventTypeLabel(event.type) },
    event.creditMinutes
      ? {
          label: 'Carga horária',
          value: formatCreditMinutes(event.creditMinutes),
        }
      : undefined,
    event.locationDescription
      ? { label: 'Local', value: event.locationDescription }
      : undefined,
    event.slots ? { label: 'Vagas', value: String(event.slots) } : undefined,
    event.majorEvent?.name
      ? { label: 'Grande evento', value: event.majorEvent.name }
      : undefined,
    event.eventGroup?.name
      ? { label: 'Grupo', value: event.eventGroup.name }
      : undefined,
  ]);
}

function eventGroupInfoRows(
  group: PublicEventGroup,
  events: PublicEvent[],
): InfoRow[] {
  const totalCreditMinutes = events.reduce(
    (total, event) => total + (event.creditMinutes ?? 0),
    0,
  );

  return cleanRows([
    { label: 'Eventos', value: String(events.length) },
    { label: 'Datas', value: formatEventsDateRange(events) },
    totalCreditMinutes > 0
      ? {
          label: 'Carga horária total',
          value: formatCreditMinutes(totalCreditMinutes),
        }
      : undefined,
    {
      label: 'Certificados',
      value: getEventGroupCertificateLabel(group),
    },
  ]);
}

function majorEventInfoRows(
  majorEvent: PublicMajorEvent,
  subscription: CurrentUserMajorEventSubscription | null,
): InfoRow[] {
  return cleanRows([
    {
      label: 'Evento',
      value: formatDateRange(majorEvent.startDate, majorEvent.endDate),
    },
    majorEvent.subscriptionStartDate && majorEvent.subscriptionEndDate
      ? {
          label: 'Inscrições',
          value: formatDateRange(
            majorEvent.subscriptionStartDate,
            majorEvent.subscriptionEndDate,
          ),
        }
      : undefined,
    subscription
      ? {
          label: 'Status',
          value: getSubscriptionStatusLabel(subscription.subscriptionStatus),
        }
      : undefined,
    subscription?.paymentDate
      ? {
          label: 'Status atualizado em',
          value: formatDateTime(subscription.paymentDate),
        }
      : undefined,
    subscription?.amountPaid !== null && subscription?.amountPaid !== undefined
      ? {
          label: 'Valor registrado',
          value: formatCurrency(subscription.amountPaid),
        }
      : undefined,
    subscription?.paymentTier
      ? { label: 'Categoria', value: subscription.paymentTier }
      : undefined,
    majorEvent.maxCoursesPerAttendee
      ? {
          label: 'Limite de minicursos',
          value: String(majorEvent.maxCoursesPerAttendee),
        }
      : undefined,
    majorEvent.maxLecturesPerAttendee
      ? {
          label: 'Limite de palestras',
          value: String(majorEvent.maxLecturesPerAttendee),
        }
      : undefined,
    majorEvent.contactInfo
      ? {
          label: getContactLabel(majorEvent.contactType),
          value: majorEvent.contactInfo,
        }
      : undefined,
    majorEvent.additionalPaymentInfo
      ? {
          label: 'Informações de pagamento',
          value: majorEvent.additionalPaymentInfo,
        }
      : undefined,
  ]);
}

function getGroupedStatusLine(eventItems: DetailEventItem[]): string {
  const attendedCount = eventItems.filter(
    (item) => item.statusLine !== 'Sem presença registrada',
  ).length;

  if (attendedCount === 0) {
    return 'Inscrito';
  } else if (attendedCount === eventItems.length) {
    return 'Presente';
  } else {
    return `Presente em ${attendedCount} de ${eventItems.length} eventos`;
  }
}

function sortEvents(events: PublicEvent[]): PublicEvent[] {
  return [...events].sort((left, right) =>
    compareIsoDateAsc(left.startDate, right.startDate),
  );
}

function cleanRows(rows: Array<InfoRow | undefined>): InfoRow[] {
  return rows.filter((row): row is InfoRow => Boolean(row?.value));
}
