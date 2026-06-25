import { PublicationState } from '@cacic-fct/shared-data-types';
import { PublicationActionResult } from './publishing.models';

export type TargetSync = {
  eventIds: string[];
  majorEventIds: string[];
};

export type PublicationJobData = {
  targetType: 'EVENT' | 'MAJOR_EVENT';
  targetId: string;
};

export type PublicationQueueData = PublicationJobData | Record<string, never>;

export type PublicationTransitionOutcome = {
  result: PublicationActionResult;
  sync: TargetSync;
  scheduledState: PublicationState | null;
  scheduledPublishAt: Date | null;
};
