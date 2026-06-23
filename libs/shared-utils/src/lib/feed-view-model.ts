import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import {
  compareIsoDateDesc,
  formatStatusLine,
  formatDateRange,
  formatDateTime,
  getAttendanceByEventId,
  getEventAttendanceStatusLabel,
  getSubscriptionStatusLabel,
} from './attendance-formatters';
import {
  CurrentUserEventAttendance,
  CurrentUserEventParticipation,
  CurrentUserMajorEventFeedItem,
  SubscribedItem,
  SubscriptionsFeed,
} from './attendance-models';

export function sortSubscriptionsFeed(feed: SubscriptionsFeed): SubscriptionsFeed {
  return {
    ...feed,
    majorEventItems: [...feed.majorEventItems].sort((left, right) =>
      compareIsoDateDesc(left.majorEvent.startDate, right.majorEvent.startDate),
    ),
    eventItems: [...feed.eventItems].sort((left, right) => compareIsoDateDesc(left.startDate, right.startDate)),
  };
}

export function getSubscribedItemEmoji(item: SubscribedItem): string {
  if (item.__typename === 'SubscribedSingleEventItem') {
    return item.event.emoji;
  }

  return item.eventGroup.emoji;
}

export function getSubscribedItemTitle(item: SubscribedItem): string {
  if (item.__typename === 'SubscribedSingleEventItem') {
    return item.event.name;
  }

  return item.eventGroup.name;
}

export function getSubscribedItemDateLine(item: SubscribedItem): string {
  if (item.__typename === 'SubscribedSingleEventItem') {
    return getEventDateLine(item.event);
  }

  if (item.events.length === 0) {
    return formatDateTime(item.startDate);
  }

  const firstEvent = item.events[0];
  const lastEvent = item.events[item.events.length - 1];
  if (!firstEvent || !lastEvent) {
    return 'Datas a confirmar';
  }

  return formatDateRange(firstEvent.startDate, lastEvent.endDate);
}

export function getSubscribedItemStatusLine(item: SubscribedItem, attendances: CurrentUserEventAttendance[]): string {
  const participationLabels = getParticipationStatusLabels(item.participation);
  const attendanceByEventId = getAttendanceByEventId(attendances);

  if (item.__typename === 'SubscribedSingleEventItem') {
    const attendance = attendanceByEventId.get(item.event.id);
    return formatStatusLine([
      attendance ? getEventAttendanceStatusLabel(attendance) : undefined,
      ...participationLabels,
    ]);
  }

  const attendedCount = item.events.filter((event) => attendanceByEventId.has(event.id)).length;

  if (attendedCount === 0) {
    return formatStatusLine(participationLabels);
  }

  return formatStatusLine([
    `Presença registrada em ${attendedCount} de ${item.events.length} eventos`,
    ...participationLabels,
  ]);
}

export function getMajorEventDateLine(subscription: CurrentUserMajorEventFeedItem): string {
  return formatDateRange(subscription.majorEvent.startDate, subscription.majorEvent.endDate);
}

export function getMajorEventStatusLine(subscription: CurrentUserMajorEventFeedItem): string {
  return formatStatusLine([
    subscription.subscriptionStatus && subscription.subscriptionStatus !== 'CONFIRMED'
      ? getSubscriptionStatusLabel(subscription.subscriptionStatus)
      : undefined,
    ...getParticipationStatusLabels(subscription.participation),
  ]);
}

export function getEventDateLine(event: PublicEvent): string {
  return formatDateRange(event.startDate, event.endDate);
}

export function getParticipationStatusLabels(participation: CurrentUserEventParticipation): string[] {
  return [
    participation.isSubscribed ? 'Inscrito' : undefined,
    participation.isLecturer ? 'Palestrante' : undefined,
    participation.hasIssuedCertificate ? 'Certificado emitido' : undefined,
  ].filter((label): label is string => !!label);
}
