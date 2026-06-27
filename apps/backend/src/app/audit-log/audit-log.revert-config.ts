import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException } from '@nestjs/common';
import { AuditLogEntityType, AuditLogOperation } from '@prisma/client';
import { RevertEntityConfig } from './audit-log.types';

const EVENT_MUTABLE_FIELDS = [
  'name',
  'creditMinutes',
  'startDate',
  'endDate',
  'type',
  'emoji',
  'description',
  'shortDescription',
  'latitude',
  'longitude',
  'locationDescription',
  'majorEventId',
  'eventGroupId',
  'allowSubscription',
  'subscriptionStartDate',
  'subscriptionEndDate',
  'slots',
  'autoSubscribe',
  'shouldIssueCertificate',
  'shouldIssueCertificateForNonPayingAttendees',
  'shouldIssueCertificateForNonSubscribedAttendees',
  'shouldCollectAttendance',
  'isOnlineAttendanceAllowed',
  'shouldProvideSubscriberListToLecturer',
  'onlineAttendanceCode',
  'onlineAttendanceStartDate',
  'onlineAttendanceEndDate',
  'publiclyVisible',
  'youtubeCode',
  'buttonText',
  'buttonLink',
  'deletedAt',
] as const;

const NON_REVERSIBLE_OPERATIONS = new Set<AuditLogOperation>([
  AuditLogOperation.IMPORT,
  AuditLogOperation.ISSUE,
  AuditLogOperation.MERGE,
  AuditLogOperation.REISSUE,
  AuditLogOperation.SCAN,
  AuditLogOperation.UNDO,
  AuditLogOperation.REVERT,
]);

export function getAuditLogRevertConfig(entityType: AuditLogEntityType): RevertEntityConfig {
  switch (entityType) {
    case AuditLogEntityType.PERSON:
      return {
        readPermission: Permission.Person.Read,
        updatePermission: Permission.Person.Update,
        deletePermission: Permission.Person.Delete,
        supportsSoftDelete: true,
        mutableFields: [
          'name',
          'email',
          'secondaryEmails',
          'phone',
          'identityDocument',
          'academicId',
          'userId',
          'mergedIntoId',
          'externalRef',
          'deletedAt',
        ],
        select: {
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
        },
      };
    case AuditLogEntityType.EVENT:
      return {
        readPermission: Permission.Event.Read,
        updatePermission: Permission.Event.Update,
        deletePermission: Permission.Event.Delete,
        supportsSoftDelete: true,
        mutableFields: EVENT_MUTABLE_FIELDS,
        select: {
          id: true,
          ...Object.fromEntries(EVENT_MUTABLE_FIELDS.map((field) => [field, true])),
        },
      };
    case AuditLogEntityType.MAJOR_EVENT:
      return {
        readPermission: Permission.MajorEvent.Read,
        updatePermission: Permission.MajorEvent.Update,
        deletePermission: Permission.MajorEvent.Delete,
        supportsSoftDelete: true,
        mutableFields: [
          'name',
          'startDate',
          'endDate',
          'description',
          'emoji',
          'subscriptionStartDate',
          'subscriptionEndDate',
          'maxCoursesPerAttendee',
          'maxLecturesPerAttendee',
          'maxUncategorizedPerAttendee',
          'rankedSubscriptionEnabled',
          'buttonText',
          'buttonLink',
          'contactInfo',
          'contactType',
          'isPaymentRequired',
          'shouldIssueCertificateForNonPayingAttendees',
          'shouldIssueCertificateForNonSubscribedAttendees',
          'additionalPaymentInfo',
          'deletedAt',
        ],
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          description: true,
          emoji: true,
          subscriptionStartDate: true,
          subscriptionEndDate: true,
          maxCoursesPerAttendee: true,
          maxLecturesPerAttendee: true,
          maxUncategorizedPerAttendee: true,
          rankedSubscriptionEnabled: true,
          buttonText: true,
          buttonLink: true,
          contactInfo: true,
          contactType: true,
          isPaymentRequired: true,
          shouldIssueCertificateForNonPayingAttendees: true,
          shouldIssueCertificateForNonSubscribedAttendees: true,
          additionalPaymentInfo: true,
          publicationState: true,
          scheduledPublishAt: true,
          publishedAt: true,
          unpublishedAt: true,
          publicationScheduledBy: true,
          publicationUpdatedBy: true,
          deletedAt: true,
        },
      };
    case AuditLogEntityType.EVENT_GROUP:
      return {
        readPermission: Permission.EventGroup.Read,
        updatePermission: Permission.EventGroup.Update,
        deletePermission: Permission.EventGroup.Delete,
        supportsSoftDelete: true,
        mutableFields: [
          'name',
          'emoji',
          'shouldIssueCertificate',
          'shouldIssueCertificateForNonPayingAttendees',
          'shouldIssueCertificateForNonSubscribedAttendees',
          'shouldIssueCertificateForEachEvent',
          'shouldIssuePartialCertificate',
          'deletedAt',
        ],
        select: {
          id: true,
          name: true,
          emoji: true,
          shouldIssueCertificate: true,
          shouldIssueCertificateForNonPayingAttendees: true,
          shouldIssueCertificateForNonSubscribedAttendees: true,
          shouldIssueCertificateForEachEvent: true,
          shouldIssuePartialCertificate: true,
          deletedAt: true,
        },
      };
    case AuditLogEntityType.PLACE_PRESET:
      return {
        readPermission: Permission.PlacePreset.Read,
        updatePermission: Permission.PlacePreset.Update,
        deletePermission: Permission.PlacePreset.Delete,
        supportsSoftDelete: true,
        mutableFields: ['name', 'latitude', 'longitude', 'locationDescription', 'deletedAt'],
        select: {
          id: true,
          name: true,
          latitude: true,
          longitude: true,
          locationDescription: true,
          deletedAt: true,
        },
      };
    case AuditLogEntityType.PERMISSION_GRANT:
      return {
        readPermission: Permission.PermissionGrant.Read,
        updatePermission: Permission.PermissionGrant.Update,
        deletePermission: Permission.PermissionGrant.Delete,
        supportsSoftDelete: true,
        mutableFields: [
          'userId',
          'personId',
          'permission',
          'scope',
          'eventId',
          'majorEventId',
          'eventGroupId',
          'validFrom',
          'validUntil',
          'deletedAt',
        ],
        select: {
          userId: true,
          personId: true,
          permission: true,
          scope: true,
          eventId: true,
          majorEventId: true,
          eventGroupId: true,
          validFrom: true,
          validUntil: true,
          deletedAt: true,
        },
      };
    case AuditLogEntityType.EVENT_SUBSCRIPTION:
    case AuditLogEntityType.EVENT_GROUP_SUBSCRIPTION:
      return { readPermission: Permission.Subscription.Read, supportsSoftDelete: true, mutableFields: [], select: {} };
    case AuditLogEntityType.MAJOR_EVENT_SUBSCRIPTION:
      return { readPermission: Permission.Subscription.Read, supportsSoftDelete: true, mutableFields: [], select: {} };
    case AuditLogEntityType.EVENT_ATTENDANCE:
      return { readPermission: Permission.EventAttendance.Read, supportsSoftDelete: false, mutableFields: [], select: {} };
    case AuditLogEntityType.EVENT_ATTENDANCE_COLLECTOR:
      return {
        readPermission: Permission.EventAttendanceCollector.Read,
        supportsSoftDelete: false,
        mutableFields: [],
        select: {},
      };
    case AuditLogEntityType.EVENT_LECTURER:
      return { readPermission: Permission.EventLecturer.Read, supportsSoftDelete: false, mutableFields: [], select: {} };
    case AuditLogEntityType.CERTIFICATE_CONFIG:
      return { readPermission: Permission.CertificateConfig.Read, supportsSoftDelete: true, mutableFields: [], select: {} };
    case AuditLogEntityType.CERTIFICATE:
      return { readPermission: Permission.Certificate.Read, supportsSoftDelete: true, mutableFields: [], select: {} };
    case AuditLogEntityType.MERGE_CANDIDATE:
      return { readPermission: Permission.MergeCandidate.Read, supportsSoftDelete: true, mutableFields: [], select: {} };
    case AuditLogEntityType.RECEIPT_VALIDATION:
      return { readPermission: Permission.Receipt.Read, supportsSoftDelete: false, mutableFields: [], select: {} };
    default:
      throw new BadRequestException('Tipo de histórico não suportado.');
  }
}

export function isReversibleAuditOperation(operation: AuditLogOperation): boolean {
  return !NON_REVERSIBLE_OPERATIONS.has(operation);
}
