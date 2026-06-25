import { PublicationState, PublicationTargetType } from '@cacic-fct/shared-data-types';
import { PublicationActionResult } from './publishing.models';

export type TargetSync = {
  eventIds: string[];
  majorEventIds: string[];
};

export type SchedulablePublicationTargetType =
  | typeof PublicationTargetType.EVENT
  | typeof PublicationTargetType.MAJOR_EVENT;

export type PublicationJobData = {
  targetType: SchedulablePublicationTargetType;
  targetId: string;
};

export type PublicationQueueData = PublicationJobData | Record<string, unknown> | null;

export type PublicationTransitionOutcome = {
  result: PublicationActionResult;
  sync: TargetSync;
  scheduledState: PublicationState | null;
  scheduledPublishAt: Date | null;
};
