import { PublicationState, PublicationTargetType } from '@cacic-fct/shared-data-types';
import { PublicationState as PrismaPublicationState } from '@prisma/client';
import { PublicContentNode } from './publishing.models';
import {
  PublicationEventGroupRecord,
  PublicationEventRecord,
  PublicationMajorEventRecord,
} from './publishing.selects';
import { publicationStateLabel } from './publishing-labels';

export function buildPublicationTree(
  majorEvents: PublicationMajorEventRecord[],
  eventGroups: PublicationEventGroupRecord[],
  standaloneEvents: PublicationEventRecord[],
): PublicContentNode[] {
  return [
    ...majorEvents.map((majorEvent) => mapMajorEventNode(majorEvent)),
    ...eventGroups.map((eventGroup) => mapStandaloneEventGroupNode(eventGroup)),
    ...standaloneEvents.map((event) => mapEventNode(event)),
  ];
}

function mapMajorEventNode(majorEvent: PublicationMajorEventRecord): PublicContentNode {
  const directEvents = majorEvent.events.filter((event) => !event.eventGroupId);
  const groupedEvents = new Map<string, PublicationEventRecord[]>();
  for (const event of majorEvent.events) {
    if (!event.eventGroupId || !event.eventGroup || event.eventGroup.deletedAt) {
      continue;
    }
    const events = groupedEvents.get(event.eventGroupId) ?? [];
    events.push(event);
    groupedEvents.set(event.eventGroupId, events);
  }

  const groupNodes = [...groupedEvents.values()].map((events) => mapEventGroupNode(events, majorEvent.name));
  const eventNodes = directEvents.map((event) => mapEventNode(event, majorEvent.name));

  return {
    targetType: PublicationTargetType.MAJOR_EVENT,
    id: majorEvent.id,
    label: majorEvent.name,
    publicationState: majorEvent.publicationState,
    statusLabel: publicationStateLabel(majorEvent.publicationState, majorEvent.scheduledPublishAt),
    scheduledPublishAt: majorEvent.scheduledPublishAt,
    publishedAt: majorEvent.publishedAt,
    unpublishedAt: majorEvent.unpublishedAt,
    publiclyVisible: null,
    parentLabel: null,
    childCount: groupNodes.length + eventNodes.length,
    children: [...groupNodes, ...eventNodes],
  };
}

function mapStandaloneEventGroupNode(eventGroup: PublicationEventGroupRecord): PublicContentNode {
  return mapEventGroupNode(eventGroup.events, null, {
    id: eventGroup.id,
    name: eventGroup.name,
  });
}

function mapEventGroupNode(
  events: PublicationEventRecord[],
  parentLabel: string | null,
  fallback?: { id: string; name: string },
): PublicContentNode {
  const firstEvent = events[0];
  const eventGroup = firstEvent?.eventGroup;
  const publicationState = deriveGroupState(events);

  return {
    targetType: PublicationTargetType.EVENT_GROUP,
    id: eventGroup?.id ?? fallback?.id ?? '',
    label: eventGroup?.name ?? fallback?.name ?? 'Grupo de eventos',
    publicationState,
    statusLabel: publicationStateLabel(publicationState, deriveGroupSchedule(events)),
    scheduledPublishAt: deriveGroupSchedule(events),
    publishedAt: null,
    unpublishedAt: null,
    publiclyVisible: null,
    parentLabel,
    childCount: events.length,
    children: events.map((event) => mapEventNode(event, eventGroup?.name ?? parentLabel)),
  };
}

function mapEventNode(event: PublicationEventRecord, parentLabel: string | null = null): PublicContentNode {
  return {
    targetType: PublicationTargetType.EVENT,
    id: event.id,
    label: event.name,
    publicationState: event.publicationState,
    statusLabel: publicationStateLabel(event.publicationState, event.scheduledPublishAt),
    scheduledPublishAt: event.scheduledPublishAt,
    publishedAt: event.publishedAt,
    unpublishedAt: event.unpublishedAt,
    publiclyVisible: event.publiclyVisible,
    parentLabel,
    childCount: 0,
    children: [],
  };
}

function deriveGroupState(events: PublicationEventRecord[]): PublicationState {
  if (events.some((event) => event.publicationState === PrismaPublicationState.PUBLISHED && event.publiclyVisible)) {
    return PrismaPublicationState.PUBLISHED;
  }
  if (events.some((event) => event.publicationState === PrismaPublicationState.SCHEDULED)) {
    return PrismaPublicationState.SCHEDULED;
  }
  if (events.length > 0 && events.every((event) => event.publicationState === PrismaPublicationState.UNPUBLISHED)) {
    return PrismaPublicationState.UNPUBLISHED;
  }
  return PrismaPublicationState.DRAFT;
}

function deriveGroupSchedule(events: PublicationEventRecord[]): Date | null {
  const scheduledDates = events
    .map((event) => event.scheduledPublishAt)
    .filter((date): date is Date => date != null)
    .sort((left, right) => left.getTime() - right.getTime());
  return scheduledDates[0] ?? null;
}
