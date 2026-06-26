import type {
  CertificateTemplateSearchDocument,
  MajorEventSearchDocument,
  PersonSearchDocument,
  PlacePresetSearchDocument,
} from './typesense-search.types';
import { toOptionalString, toUnixTimestamp } from './typesense-search.shared';

export function toMajorEventSearchDocument(input: {
  id: string;
  name: string;
  description?: string | null;
  startDate: Date;
  endDate: Date;
  publicationState?: string | null;
}): MajorEventSearchDocument {
  return {
    id: input.id,
    name: input.name,
    description: toOptionalString(input.description),
    startDate: toUnixTimestamp(input.startDate),
    endDate: toUnixTimestamp(input.endDate),
    publicationState: input.publicationState ?? 'DRAFT',
  };
}

export function toPersonSearchDocument(input: {
  id: string;
  name: string;
  email?: string | null;
  secondaryEmails?: string[];
  phone?: string | null;
  identityDocument?: string | null;
  academicId?: string | null;
  userId?: string | null;
}): PersonSearchDocument {
  return {
    id: input.id,
    name: input.name,
    email: toOptionalString(input.email),
    secondaryEmails: input.secondaryEmails?.filter(Boolean),
    phone: toOptionalString(input.phone),
    identityDocument: toOptionalString(input.identityDocument),
    academicId: toOptionalString(input.academicId),
    userId: toOptionalString(input.userId),
  };
}

export function toPlacePresetSearchDocument(input: {
  id: string;
  name: string;
  locationDescription?: string | null;
}): PlacePresetSearchDocument {
  return {
    id: input.id,
    name: input.name,
    locationDescription: toOptionalString(input.locationDescription),
  };
}

export function toCertificateTemplateSearchDocument(input: {
  id: string;
  name: string;
  description?: string | null;
  version: number;
  isActive: boolean;
}): CertificateTemplateSearchDocument {
  return {
    id: input.id,
    name: input.name,
    description: toOptionalString(input.description),
    version: input.version,
    isActive: input.isActive,
  };
}
