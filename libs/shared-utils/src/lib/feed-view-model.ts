import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import {
  compareIsoDateDesc,
  formatStatusLine,
  formatDateRange,
  formatDateTime,
  getAttendanceByEventId,
  getSubscriptionStatusSummaryLabel,
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
    standaloneCertificateFolders: [...(feed.standaloneCertificateFolders ?? [])].sort((left, right) => {
      const leftIssuedAt = left.certificates[0]?.issuedAt;
      const rightIssuedAt = right.certificates[0]?.issuedAt;
      const dateComparison =
        leftIssuedAt && rightIssuedAt
          ? compareIsoDateDesc(leftIssuedAt, rightIssuedAt)
          : leftIssuedAt
            ? -1
            : rightIssuedAt
              ? 1
              : 0;

      return dateComparison || left.name.localeCompare(right.name, 'pt-BR');
    }),
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
  const attendanceByEventId = getAttendanceByEventId(attendances);

  if (item.__typename === 'SubscribedSingleEventItem') {
    const attendance = attendanceByEventId.get(item.event.id);
    return formatStatusLine([
      attendance ? 'Presença registrada' : undefined,
      ...getFeedParticipationStatusLabels(item.participation, Boolean(attendance)),
    ]);
  }

  const attendedCount = item.events.filter((event) => attendanceByEventId.has(event.id)).length;
  const hasAttendance =
    attendedCount > 0 ||
    (item.events.length === 0 &&
      attendances.some((attendance) => attendance.event?.eventGroupId === item.eventGroup.id));

  if (attendedCount === 0) {
    return formatStatusLine([
      hasAttendance ? 'Presença registrada' : undefined,
      ...getFeedParticipationStatusLabels(item.participation, hasAttendance),
    ]);
  }

  return formatStatusLine([
    `Presença registrada em ${attendedCount} de ${item.events.length} eventos`,
    ...getFeedParticipationStatusLabels(item.participation, hasAttendance),
  ]);
}

export function getMajorEventDateLine(subscription: CurrentUserMajorEventFeedItem): string {
  return formatDateRange(subscription.majorEvent.startDate, subscription.majorEvent.endDate);
}

export function getMajorEventStatusLine(
  subscription: CurrentUserMajorEventFeedItem,
  attendances: CurrentUserEventAttendance[] = [],
): string {
  const hasAttendance = attendances.some((attendance) => attendance.event?.majorEventId === subscription.majorEventId);
  const hasPendingSubscriptionStatus = Boolean(
    subscription.subscriptionStatus && subscription.subscriptionStatus !== 'CONFIRMED',
  );

  return formatStatusLine([
    hasAttendance ? 'Presença registrada' : undefined,
    hasPendingSubscriptionStatus ? getSubscriptionStatusSummaryLabel(subscription.subscriptionStatus ?? '') : undefined,
    ...getFeedParticipationStatusLabels(subscription.participation, hasAttendance, !hasPendingSubscriptionStatus),
  ]);
}

export function getEventDateLine(event: PublicEvent): string {
  return formatDateRange(event.startDate, event.endDate);
}

export function getParticipationStatusLabels(participation: CurrentUserEventParticipation): string[] {
  return [
    participation.isSubscribed ? 'Inscrito' : undefined,
    participation.isLecturer ? 'Palestrante' : undefined,
    participation.isSportsManager ? 'Gestão esportiva' : undefined,
    participation.hasIssuedCertificate ? 'Certificado emitido' : undefined,
  ].filter((label): label is string => !!label);
}

function getFeedParticipationStatusLabels(
  participation: CurrentUserEventParticipation,
  hasAttendance: boolean,
  includeSubscriptionLabel = true,
): string[] {
  const labels = [
    participation.hasIssuedCertificate ? 'Certificado emitido' : undefined,
    participation.isLecturer ? 'Palestrante' : undefined,
    participation.isSportsManager ? 'Gestão esportiva' : undefined,
  ].filter((label): label is string => !!label);

  if (labels.length > 0) {
    return labels;
  }

  if (!hasAttendance && participation.isSubscribed && includeSubscriptionLabel) {
    return ['Inscrito'];
  }

  if (hasAttendance) {
    return [];
  }

  return ['Sem inscrição'];
}
