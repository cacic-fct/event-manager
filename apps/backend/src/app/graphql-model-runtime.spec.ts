import { LazyMetadataStorage } from '@nestjs/graphql/dist/schema-builder/storages/lazy-metadata.storage';
import { TypeMetadataStorage } from '@nestjs/graphql/dist/schema-builder/storages/type-metadata.storage';
import { EventManagerPermissionGrantScope } from '@prisma/client';
import {
  EventManagerPermissionGrant,
  EventManagerPermissionGrantCreateInput,
  EventManagerPermissionGrantTarget,
  EventManagerPermissionGrantUpdateInput,
} from './authorization/permission-grants.models';
import {
  CurrentUserAdminCalendarFeedSettings,
  CurrentUserCalendarFeedSettings,
  SuperAdminCalendarFeedSettings,
} from './calendar/calendar.models';
import {
  AuditLogChange,
  AuditLogEntityHistoryInput,
  AuditLogEntry,
  AuditLogExplorerEntry,
  AuditLogExplorerInput,
  AuditLogExplorerResult,
  AuditLogExplorerRevertedStatus,
  AuditLogRevertInput,
} from './audit-log/audit-log.models';
import {
  DashboardActionLink,
  DashboardCalendarEvent,
  DashboardCertificatePendingItem,
  DashboardCertificateTargetType,
  DashboardInconsistency,
  DashboardInconsistencyType,
  DashboardInsightAction,
  DashboardInsightSeverity,
  DashboardPendingOfflineAttendanceEvent,
  DashboardPendingReceiptMajorEvent,
  DashboardPermissionAction,
  DashboardPermissionGroup,
  DashboardSummary,
  DashboardWeatherAlert,
  WorkspaceDashboardInsights,
} from './dashboard/models';
import {
  PublicContentNode,
  PublishContentPreviewInput,
  PublishContentPreviewPayload,
  PublishContentPreviewResult,
  PublishContentWorkspace,
  PublicationActionResult,
  PublicationBulkInput,
  PublicationBulkOperation,
  PublicationStateInput,
} from './publishing/publishing.models';
import { PublicationState, PublicationTargetType } from '@cacic-fct/shared-data-types';
import {
  PublicEvent,
  PublicEventGroup,
  PublicEventSubscriptionSummary,
  PublicLecturerProfile,
  PublicMajorEvent,
  PublicMajorEventPrice,
  PublicMajorEventPriceTier,
  PublicMajorEventSubscriptionPage,
  PublicPaymentInfo,
} from './public-events/models';
import {
  ConfirmCurrentUserOnlineAttendanceInput,
  CurrentUserAttendanceCollectionEvent,
  CurrentUserEventAttendance,
  CurrentUserEventGroupSubscription,
  CurrentUserEventParticipation,
  CurrentUserEventSubscription,
  CurrentUserMajorEventFeedItem,
  CurrentUserMajorEventSubscription,
  CurrentUserOrganizerEventInfo,
  CurrentUserOrganizerInfo,
  CurrentUserPendingOnlineAttendanceEvent,
  CurrentUserProfileContext,
  CurrentUserStandaloneCertificateFolder,
  CurrentUserSubscriptionFeed,
  CurrentUserSubscriptionFeedEventGroup,
  CurrentUserSubscriptionFeedItem,
  CurrentUserSubscriptionFeedSingleEvent,
  SubscribedEventGroupItem,
  SubscribedSingleEventItem,
  UpsertCurrentUserMajorEventSubscriptionInput,
} from './current-user/models';

type GraphqlModelClass = new () => object;

type FieldSnapshot = {
  field: string;
  model: string;
  nullable?: boolean | 'items' | 'itemsAndList';
  type: string;
};

function resolveGraphqlFieldTypes(classes: GraphqlModelClass[]): FieldSnapshot[] {
  LazyMetadataStorage.load(classes);
  TypeMetadataStorage.compile(classes);

  return classes.flatMap((model) => {
    const metadata =
      TypeMetadataStorage.getObjectTypeMetadataByTarget(model) ??
      TypeMetadataStorage.getInputTypeMetadataByTarget(model);

    if (!metadata) {
      throw new Error(`Missing GraphQL metadata for ${model.name}`);
    }

    return (metadata.properties ?? []).map((field) => {
      const type = describeGraphqlType(field.typeFn());

      return {
        field: field.name,
        model: model.name,
        nullable: field.options.nullable,
        type: field.options.isArray ? `[${type}]` : type,
      };
    });
  });
}

function describeGraphqlType(type: unknown): string {
  if (Array.isArray(type)) {
    return `[${type.map((item) => describeGraphqlType(item)).join(', ')}]`;
  }

  const enumMetadata = TypeMetadataStorage.getEnumsMetadata().find((metadata) => metadata.ref === type);
  if (enumMetadata) {
    return enumMetadata.name;
  }

  if (typeof type === 'function') {
    return type.name;
  }

  if (type && typeof type === 'object' && 'name' in type && typeof type.name === 'string') {
    return type.name;
  }

  return String(type);
}

describe('GraphQL model runtime metadata', () => {
  it('resolves authorization permission grant model field types', () => {
    const fields = resolveGraphqlFieldTypes([
      EventManagerPermissionGrant,
      EventManagerPermissionGrantTarget,
      EventManagerPermissionGrantCreateInput,
      EventManagerPermissionGrantUpdateInput,
    ]);

    expect(fields).toHaveLength(37);
    expect(fields).toEqual(
      expect.arrayContaining([
        { field: 'id', model: 'EventManagerPermissionGrant', nullable: undefined, type: 'String' },
        {
          field: 'scope',
          model: 'EventManagerPermissionGrant',
          nullable: undefined,
          type: 'EventManagerPermissionGrantScope',
        },
        { field: 'validUntil', model: 'EventManagerPermissionGrantUpdateInput', nullable: true, type: 'Date' },
      ]),
    );
    expect(EventManagerPermissionGrantScope.EVENT).toBe('EVENT');
  });

  it('resolves private calendar feed setting model field types', () => {
    const fields = resolveGraphqlFieldTypes([
      CurrentUserCalendarFeedSettings,
      CurrentUserAdminCalendarFeedSettings,
      SuperAdminCalendarFeedSettings,
    ]);

    expect(fields).toHaveLength(20);
    expect(fields).toEqual(
      expect.arrayContaining([
        { field: 'enabled', model: 'CurrentUserCalendarFeedSettings', nullable: undefined, type: 'Boolean' },
        { field: 'feedPath', model: 'CurrentUserAdminCalendarFeedSettings', nullable: true, type: 'String' },
        { field: 'rotatedAt', model: 'SuperAdminCalendarFeedSettings', nullable: true, type: 'Date' },
      ]),
    );
  });

  it('resolves audit log model and input field types', () => {
    const fields = resolveGraphqlFieldTypes([
      AuditLogChange,
      AuditLogEntry,
      AuditLogExplorerEntry,
      AuditLogExplorerResult,
      AuditLogEntityHistoryInput,
      AuditLogRevertInput,
      AuditLogExplorerInput,
    ]);

    expect(fields).toEqual(
      expect.arrayContaining([
        { field: 'changes', model: 'AuditLogEntry', nullable: undefined, type: '[AuditLogChange]' },
        { field: 'entries', model: 'AuditLogExplorerResult', nullable: undefined, type: '[AuditLogExplorerEntry]' },
        { field: 'mode', model: 'AuditLogRevertInput', nullable: undefined, type: 'AuditLogRevertMode' },
        {
          field: 'revertedStatus',
          model: 'AuditLogExplorerInput',
          nullable: true,
          type: 'AuditLogExplorerRevertedStatus',
        },
      ]),
    );
    expect(AuditLogExplorerRevertedStatus.NOT_REVERTED).toBe('NOT_REVERTED');
  });

  it('resolves dashboard insight model field types', () => {
    const fields = resolveGraphqlFieldTypes([
      DashboardActionLink,
      DashboardSummary,
      DashboardCalendarEvent,
      DashboardWeatherAlert,
      DashboardCertificatePendingItem,
      DashboardPendingReceiptMajorEvent,
      DashboardPendingOfflineAttendanceEvent,
      DashboardInconsistency,
      DashboardPermissionAction,
      DashboardPermissionGroup,
      WorkspaceDashboardInsights,
    ]);

    expect(fields).toEqual(
      expect.arrayContaining([
        { field: 'action', model: 'DashboardActionLink', nullable: undefined, type: 'DashboardInsightAction' },
        {
          field: 'targetType',
          model: 'DashboardCertificatePendingItem',
          nullable: undefined,
          type: 'DashboardCertificateTargetType',
        },
        {
          field: 'inconsistencies',
          model: 'WorkspaceDashboardInsights',
          nullable: undefined,
          type: '[DashboardInconsistency]',
        },
      ]),
    );
    expect(DashboardInsightAction.OPEN_PUBLICATION).toBe('OPEN_PUBLICATION');
    expect(DashboardInsightSeverity.CRITICAL).toBe('CRITICAL');
    expect(DashboardCertificateTargetType.MAJOR_EVENT).toBe('MAJOR_EVENT');
    expect(DashboardInconsistencyType.EVENT_WITHOUT_PLACE).toBe('EVENT_WITHOUT_PLACE');
  });

  it('resolves publishing workspace model field types', () => {
    const fields = resolveGraphqlFieldTypes([
      PublicContentNode,
      PublishContentWorkspace,
      PublicationStateInput,
      PublicationBulkInput,
      PublishContentPreviewInput,
      PublicationActionResult,
      PublishContentPreviewResult,
      PublishContentPreviewPayload,
    ]);

    expect(fields).toEqual(
      expect.arrayContaining([
        { field: 'children', model: 'PublicContentNode', nullable: undefined, type: '[PublicContentNode]' },
        {
          field: 'warnings',
          model: 'PublishContentWorkspace',
          nullable: undefined,
          type: '[DashboardInconsistency]',
        },
        { field: 'operation', model: 'PublicationBulkInput', nullable: undefined, type: 'PublicationBulkOperation' },
        { field: 'events', model: 'PublishContentPreviewPayload', nullable: undefined, type: '[PublicEvent]' },
      ]),
    );
    expect(PublicationBulkOperation.SCHEDULE_BUNDLE).toBe('SCHEDULE_BUNDLE');
    expect(PublicationState.PUBLISHED).toBe('PUBLISHED');
    expect(PublicationTargetType.MAJOR_EVENT).toBe('MAJOR_EVENT');
  });

  it('resolves public event model field types', () => {
    const fields = resolveGraphqlFieldTypes([
      PublicPaymentInfo,
      PublicMajorEventPriceTier,
      PublicMajorEventPrice,
      PublicMajorEvent,
      PublicEventGroup,
      PublicLecturerProfile,
      PublicEvent,
      PublicEventSubscriptionSummary,
      PublicMajorEventSubscriptionPage,
    ]);

    expect(fields).toEqual(
      expect.arrayContaining([
        { field: 'paymentInfo', model: 'PublicMajorEvent', nullable: true, type: 'PublicPaymentInfo' },
        { field: 'majorEventPrices', model: 'PublicMajorEvent', nullable: undefined, type: '[PublicMajorEventPrice]' },
        { field: 'eventGroup', model: 'PublicEvent', nullable: true, type: 'PublicEventGroup' },
        { field: 'lecturers', model: 'PublicEvent', nullable: undefined, type: '[PublicLecturerProfile]' },
        {
          field: 'subscriptionSummaries',
          model: 'PublicMajorEventSubscriptionPage',
          nullable: undefined,
          type: '[PublicEventSubscriptionSummary]',
        },
      ]),
    );
  });

  it('resolves current-user model and input field types', () => {
    const fields = resolveGraphqlFieldTypes([
      CurrentUserProfileContext,
      CurrentUserEventAttendance,
      CurrentUserPendingOnlineAttendanceEvent,
      CurrentUserAttendanceCollectionEvent,
      CurrentUserOrganizerEventInfo,
      CurrentUserOrganizerInfo,
      CurrentUserEventSubscription,
      CurrentUserEventGroupSubscription,
      CurrentUserSubscriptionFeedSingleEvent,
      CurrentUserSubscriptionFeedEventGroup,
      CurrentUserEventParticipation,
      CurrentUserStandaloneCertificateFolder,
      CurrentUserSubscriptionFeed,
      CurrentUserSubscriptionFeedItem,
      SubscribedSingleEventItem,
      SubscribedEventGroupItem,
      CurrentUserMajorEventSubscription,
      CurrentUserMajorEventFeedItem,
      UpsertCurrentUserMajorEventSubscriptionInput,
      ConfirmCurrentUserOnlineAttendanceInput,
    ]);

    expect(fields).toEqual(
      expect.arrayContaining([
        {
          field: 'authenticatedUser',
          model: 'CurrentUserProfileContext',
          nullable: undefined,
          type: 'AuthenticatedUser',
        },
        {
          field: 'events',
          model: 'CurrentUserOrganizerInfo',
          nullable: undefined,
          type: '[CurrentUserOrganizerEventInfo]',
        },
        {
          field: 'items',
          model: 'CurrentUserSubscriptionFeed',
          nullable: undefined,
          type: '[CurrentUserSubscriptionFeedItem]',
        },
        { field: 'selectedEvents', model: 'CurrentUserMajorEventFeedItem', nullable: undefined, type: '[PublicEvent]' },
        {
          field: 'formResponses',
          model: 'UpsertCurrentUserMajorEventSubscriptionInput',
          nullable: true,
          type: '[SubmitEventFormResponseInput]',
        },
      ]),
    );
  });
});
