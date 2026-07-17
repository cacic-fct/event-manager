export type MergeCandidateStatus = 'PENDING' | 'MERGED' | 'REJECTED' | 'STALE';
export type MergeMatchMethod = 'CPF' | 'EMAIL' | 'NORMALIZED_NAME';
export type EventManagerPermissionGrantScope = 'GLOBAL' | 'EVENT' | 'MAJOR_EVENT' | 'EVENT_GROUP';
export type PersonMergeField = 'NAME' | 'EMAIL' | 'IDENTITY_DOCUMENT' | 'ACADEMIC_ID' | 'USER_ID' | 'EXTERNAL_REF';

export interface User {
  id: string;
  email: string;
  name: string;
  identityDocument?: string | null;
  academicId?: string | null;
  role: string;
}

export interface Person {
  id: string;
  name: string;
  email?: string | null;
  secondaryEmails?: string[] | null;
  phone?: string | null;
  identityDocument?: string | null;
  academicId?: string | null;
  userId?: string | null;
  user?: User | null;
  mergedIntoId?: string | null;
  externalRef?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  createdById?: string | null;
  updatedAt: string;
  updatedById?: string | null;
  lecturerProfile?: LecturerProfile | null;
}

export interface PersonLinkedResource {
  id: string;
  label: string;
  description?: string | null;
  route?: string | null;
  status?: string | null;
  occurredAt?: string | null;
}

export interface PersonLinkedResourceGroup {
  type: string;
  label: string;
  icon: string;
  items?: PersonLinkedResource[];
  totalCount: number;
}

export interface PersonLinkedDataSummary {
  personId: string;
  groups: PersonLinkedResourceGroup[];
  totalCount: number;
  hasLinkedData: boolean;
  canDelete: boolean;
}

export interface PersonLinkedResourcePage {
  personId: string;
  type: string;
  label: string;
  icon: string;
  items: PersonLinkedResource[];
  total: number;
  skip: number;
  take: number;
}

export interface EventManagerPermissionGrant {
  id: string;
  userId: string;
  personId?: string | null;
  permission: string;
  scope: EventManagerPermissionGrantScope;
  eventId?: string | null;
  majorEventId?: string | null;
  eventGroupId?: string | null;
  targetLabel?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  createdAt: string;
  createdById?: string | null;
  updatedAt: string;
  updatedById?: string | null;
}

export interface EventManagerPermissionGrantTarget {
  id: string;
  label: string;
  description?: string | null;
  emoji?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface EventManagerPermissionGrantInput {
  userId: string;
  personId?: string | null;
  permission: string;
  scope: EventManagerPermissionGrantScope;
  eventId?: string | null;
  majorEventId?: string | null;
  eventGroupId?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
}

export interface EventManagerPermissionGrantUpdateInput {
  permission: string;
  scope: EventManagerPermissionGrantScope;
  eventId?: string | null;
  majorEventId?: string | null;
  eventGroupId?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
}

export interface LecturerProfile {
  id: string;
  personId: string;
  displayName: string;
  biography?: string | null;
  publishGoogleUserPicture: boolean;
  googleUserPicture?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  createdAt: string;
  createdById?: string | null;
  updatedAt: string;
  updatedById?: string | null;
}

export interface LecturerProfileInput {
  displayName: string;
  biography?: string | null;
  publishGoogleUserPicture?: boolean;
  email?: string | null;
  whatsapp?: string | null;
}

export interface MergeCandidate {
  id: string;
  personAId: string;
  personBId: string;
  personA?: Person | null;
  personB?: Person | null;
  pairKey: string;
  score?: number | null;
  matchMethod?: MergeMatchMethod | null;
  matchValue?: string | null;
  status: MergeCandidateStatus;
  resolvedById?: string | null;
  createdAt: string;
  createdById?: string | null;
  updatedAt: string;
  updatedById?: string | null;
}

export interface DeletionResult {
  deleted: boolean;
  id?: string | null;
  personId?: string | null;
  eventId?: string | null;
}

export interface PersonInput {
  id?: string;
  name?: string;
  email?: string | null;
  secondaryEmails?: string[] | null;
  phone?: string | null;
  identityDocument?: string | null;
  academicId?: string | null;
  userId?: string | null;
  mergedIntoId?: string | null;
  externalRef?: string | null;
}
