import {
  Certificate,
  CertificateConfig,
  CertificateScope,
  CertificateTemplate,
} from '@cacic-eventos/shared-data-types';
import { Prisma } from '@prisma/client';

export const MAJOR_EVENT_SELECT = {
  id: true,
  name: true,
  emoji: true,
  startDate: true,
  endDate: true,
  description: true,
  subscriptionStartDate: true,
  subscriptionEndDate: true,
  maxCoursesPerAttendee: true,
  maxLecturesPerAttendee: true,
  buttonText: true,
  buttonLink: true,
  contactInfo: true,
  contactType: true,
  isPaymentRequired: true,
  additionalPaymentInfo: true,
  deletedAt: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.MajorEventSelect;

export const EVENT_GROUP_SELECT = {
  id: true,
  name: true,
  emoji: true,
  shouldIssueCertificate: true,
  shouldIssueCertificateForEachEvent: true,
  shouldIssuePartialCertificate: true,
  deletedAt: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.EventGroupSelect;

export const EVENT_SELECT = {
  id: true,
  name: true,
  creditMinutes: true,
  startDate: true,
  endDate: true,
  type: true,
  emoji: true,
  description: true,
  shortDescription: true,
  latitude: true,
  longitude: true,
  locationDescription: true,
  majorEventId: true,
  majorEvent: {
    select: MAJOR_EVENT_SELECT,
  },
  eventGroupId: true,
  eventGroup: {
    select: EVENT_GROUP_SELECT,
  },
  allowSubscription: true,
  subscriptionStartDate: true,
  subscriptionEndDate: true,
  slots: true,
  autoSubscribe: true,
  shouldIssueCertificate: true,
  shouldCollectAttendance: true,
  isOnlineAttendanceAllowed: true,
  onlineAttendanceCode: true,
  onlineAttendanceStartDate: true,
  onlineAttendanceEndDate: true,
  publiclyVisible: true,
  youtubeCode: true,
  buttonText: true,
  buttonLink: true,
  deletedAt: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.EventSelect;

export const PERSON_SELECT = {
  id: true,
  name: true,
  email: true,
  secondaryEmails: true,
  phone: true,
  identityDocument: true,
  academicId: true,
  userId: true,
  mergedIntoId: true,
  externalRef: true,
  deletedAt: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.PeopleSelect;

export const CERTIFICATE_TEMPLATE_SELECT = {
  id: true,
  name: true,
  description: true,
  version: true,
  isActive: true,
  certificateFields: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
  deletedAt: true,
} satisfies Prisma.CertificateTemplateSelect;

export const CERTIFICATE_CONFIG_SELECT = {
  id: true,
  name: true,
  scope: true,
  majorEventId: true,
  majorEvent: {
    select: MAJOR_EVENT_SELECT,
  },
  eventGroupId: true,
  eventGroup: {
    select: EVENT_GROUP_SELECT,
  },
  eventId: true,
  event: {
    select: EVENT_SELECT,
  },
  certificateTemplateId: true,
  certificateTemplate: {
    select: CERTIFICATE_TEMPLATE_SELECT,
  },
  certificateText: true,
  isActive: true,
  issuedTo: true,
  certificateFields: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
  deletedAt: true,
} satisfies Prisma.CertificateConfigSelect;

export const CERTIFICATE_SELECT = {
  id: true,
  personId: true,
  person: {
    select: PERSON_SELECT,
  },
  configId: true,
  config: {
    select: CERTIFICATE_CONFIG_SELECT,
  },
  renderedData: true,
  issuedAt: true,
  issuedById: true,
  certificateTemplateId: true,
  certificateTemplate: {
    select: CERTIFICATE_TEMPLATE_SELECT,
  },
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.CertificateSelect;

export type EventRecord = Prisma.EventGetPayload<{
  select: typeof EVENT_SELECT;
}>;
export type EventGroupRecord = Prisma.EventGroupGetPayload<{
  select: typeof EVENT_GROUP_SELECT;
}>;
export type MajorEventRecord = Prisma.MajorEventGetPayload<{
  select: typeof MAJOR_EVENT_SELECT;
}>;
export type PersonRecord = Prisma.PeopleGetPayload<{
  select: typeof PERSON_SELECT;
}>;
export type CertificateTemplateRecord = Prisma.CertificateTemplateGetPayload<{
  select: typeof CERTIFICATE_TEMPLATE_SELECT;
}>;
export type CertificateConfigRecord = Prisma.CertificateConfigGetPayload<{
  select: typeof CERTIFICATE_CONFIG_SELECT;
}>;
export type CertificateRecord = Prisma.CertificateGetPayload<{
  select: typeof CERTIFICATE_SELECT;
}>;

export function buildConfigTargetWhere(
  scope: CertificateScope,
  targetId: string,
): Prisma.CertificateConfigWhereInput {
  if (scope === CertificateScope.EVENT) {
    return {
      scope,
      eventId: targetId,
    };
  }

  if (scope === CertificateScope.EVENT_GROUP) {
    return {
      scope,
      eventGroupId: targetId,
    };
  }

  if (scope === CertificateScope.MAJOR_EVENT) {
    return {
      scope,
      majorEventId: targetId,
    };
  }

  return {
    scope,
  };
}

const serializeJson = (value: Prisma.JsonValue | null): string | undefined => {
  if (value == null) {
    return undefined;
  }

  return JSON.stringify(value);
};

export function mapCertificateTemplate(
  template: CertificateTemplateRecord,
): CertificateTemplate {
  return {
    ...template,
    description: template.description ?? undefined,
    certificateFieldsJson: serializeJson(template.certificateFields),
    createdById: template.createdById ?? undefined,
    updatedById: template.updatedById ?? undefined,
    deletedAt: template.deletedAt ?? undefined,
  };
}

export function mapCertificateConfig(
  config: CertificateConfigRecord,
): CertificateConfig {
  return {
    ...config,
    majorEventId: config.majorEventId ?? undefined,
    majorEvent: config.majorEvent ?? undefined,
    eventGroupId: config.eventGroupId ?? undefined,
    eventGroup: config.eventGroup ?? undefined,
    eventId: config.eventId ?? undefined,
    event: config.event ?? undefined,
    certificateTemplate: mapCertificateTemplate(config.certificateTemplate),
    certificateText: config.certificateText ?? undefined,
    certificateFieldsJson: serializeJson(config.certificateFields),
    createdById: config.createdById ?? undefined,
    updatedById: config.updatedById ?? undefined,
    deletedAt: config.deletedAt ?? undefined,
  };
}

export function mapCertificate(certificate: CertificateRecord): Certificate {
  return {
    ...certificate,
    person: certificate.person,
    config: mapCertificateConfig(certificate.config),
    renderedDataJson: JSON.stringify(certificate.renderedData),
    issuedById: certificate.issuedById ?? undefined,
    certificateTemplate: mapCertificateTemplate(
      certificate.certificateTemplate,
    ),
    deletedAt: certificate.deletedAt ?? undefined,
  };
}
