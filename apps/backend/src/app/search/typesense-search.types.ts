import { Prisma } from '@prisma/client';

export type EventSearchDocument = {
  id: string;
  name: string;
  emoji: string;
  type: string;
  description?: string;
  shortDescription?: string;
  locationDescription?: string;
  majorEventId?: string;
  majorEventName?: string;
  eventGroupId?: string;
  eventGroupName?: string;
  startDate: number;
  endDate: number;
  publiclyVisible: boolean;
  publicationState: string;
  majorEventPublicationState: string;
  isIssuableCertificateEvent: boolean;
};

export type MajorEventSearchDocument = {
  id: string;
  name: string;
  description?: string;
  startDate: number;
  endDate: number;
  publicationState: string;
};

export type EventGroupSearchDocument = {
  id: string;
  name: string;
};

export type PersonSearchDocument = {
  id: string;
  name: string;
  email?: string;
  secondaryEmails?: string[];
  phone?: string;
  identityDocument?: string;
  academicId?: string;
  userId?: string;
};

export type PlacePresetSearchDocument = {
  id: string;
  name: string;
  locationDescription?: string;
};

export type CertificateTemplateSearchDocument = {
  id: string;
  name: string;
  description?: string;
  version: number;
  isActive: boolean;
};

export type AuditLogSearchDocument = {
  id: string;
  entityType: string;
  entityId: string;
  entityLabel?: string;
  operation: string;
  summary?: string;
  actorId?: string;
  actorName: string;
  actorEmail?: string;
  actorType: string;
  permission?: string;
  eventId?: string;
  majorEventId?: string;
  eventGroupId?: string;
  changedFields?: string[];
  changedFieldLabels?: string[];
  changesText?: string;
  beforeText?: string;
  afterText?: string;
  metadataText?: string;
  groupedCount: number;
  firstRecordedAt: number;
  lastRecordedAt: number;
  createdAt: number;
  reverted: boolean;
  revertedAt?: number;
  revertedById?: string;
  revertedByName?: string;
  revertedByEntryId?: string;
  revertTargetId?: string;
  revertMode?: string;
};

export type TypesenseSearchResult = {
  available: boolean;
  ids: string[];
};

export type TypesensePagedSearchResult = TypesenseSearchResult & {
  found: number;
};

export type TypesenseSearchOptions = {
  filterBy?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
};

export type AuditLogSearchDocumentInput = {
  id: string;
  entityType: string;
  entityId: string;
  entityLabel?: string | null;
  operation: string;
  summary?: string | null;
  actorId?: string | null;
  actorName: string;
  actorEmail?: string | null;
  actorType: string;
  permission?: string | null;
  eventId?: string | null;
  majorEventId?: string | null;
  eventGroupId?: string | null;
  before: Prisma.JsonValue | null;
  after: Prisma.JsonValue | null;
  changes: Prisma.JsonValue;
  changedFields: string[];
  groupedCount: number;
  firstRecordedAt: Date;
  lastRecordedAt: Date;
  createdAt: Date;
  revertedAt?: Date | null;
  revertedById?: string | null;
  revertedByName?: string | null;
  revertedByEntryId?: string | null;
  revertTargetId?: string | null;
  revertMode?: string | null;
  metadata?: Prisma.JsonValue | null;
};

export type TypesenseNodeConfig = {
  host: string;
  port: number;
  protocol: string;
};
