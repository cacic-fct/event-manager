import type { EventType, PublicationState } from './event.models';

export type AdminEventContextKind = 'EVENT' | 'EVENT_GROUP' | 'MAJOR_EVENT';

export interface AdminEventContextAncestor {
  kind: AdminEventContextKind;
  id: string;
  name: string;
  emoji: string;
}

export interface AdminEventContextNode extends AdminEventContextAncestor {
  startDate?: string | null;
  endDate?: string | null;
  eventType?: EventType | null;
  locationDescription?: string | null;
  publicationState?: PublicationState | null;
  ancestors: AdminEventContextAncestor[];
  hasChildren: boolean;
}

export interface AdminEventContextPage {
  nodes: AdminEventContextNode[];
  nextCursor: string | null;
}

export interface AdminEventContextPageOptions {
  parentKind?: AdminEventContextKind;
  parentId?: string;
  childKind?: AdminEventContextKind;
  query?: string;
  startDateFrom?: string;
  startDateUntil?: string;
  isInGroup?: boolean;
  isInMajorEvent?: boolean;
  cursor?: string;
  take?: number;
}
