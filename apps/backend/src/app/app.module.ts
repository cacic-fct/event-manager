import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import type { Request, Response } from 'express';
import { AppController } from './app.controller';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { AccountMergeController } from './account-merge/account-merge.controller';
import { AccountMergeService } from './account-merge/account-merge.service';
import { AuditLogResolver } from './audit-log/audit-log.resolver';
import { AuditLogService } from './audit-log/audit-log.service';
import { AuthModule } from './auth/auth.module';
import { PermissionManagementResolver } from './authorization/permission-management.resolver';
import { PermissionManagementService } from './authorization/permission-management.service';
import { KeycloakScopeGuard } from './auth/guards/keycloak-scope.guard';
import { KeycloakAuthService } from './auth/keycloak-auth.service';
import { createIntrospectionAuthPlugin } from './auth/introspection-auth.plugin';
import { LgpdController } from './lgpd/lgpd.controller';
import { LgpdService } from './lgpd/lgpd.service';
import { LGPD_STORAGE_CLEANUP_QUEUE, LgpdStorageCleanupService } from './lgpd/lgpd-storage-cleanup.service';
import { LgpdStorageCleanupProcessor } from './lgpd/lgpd-storage-cleanup.processor';
import { FrozenResourceService } from './common/frozen-resource.service';
import { CalendarController } from './calendar/calendar.controller';
import { CalendarFeedMaintenanceProcessor } from './calendar/calendar-feed-maintenance.processor';
import { CalendarFeedMaintenanceScheduler } from './calendar/calendar-feed-maintenance.scheduler';
import { LegacyRepeatableJobsMigrationService } from './queues/legacy-repeatable-jobs-migration.service';
import { CalendarResolver } from './calendar/calendar.resolver';
import { CALENDAR_FEED_MAINTENANCE_QUEUE } from './calendar/calendar.models';
import { CalendarService } from './calendar/calendar.service';
import { CertificateConfigsService } from './certificate/certificate-configs.service';
import { CertificateCsvImportResolver } from './certificate/certificate-csv-import.resolver';
import { CertificateDownloadService } from './certificate/certificate-download.service';
import { CertificateTemplateRegistryService } from './certificate/certificate-template-registry.service';
import { CertificateEligibilityService } from './certificate/certificate-eligibility.service';
import { CertificateSportsEligibility } from './certificate/certificate-sports-eligibility';
import { CertificateIssuingService } from './certificate/certificate-issuing.service';
import { CertificateNotificationJobsProcessor } from './certificate/certificate-notification-jobs.processor';
import {
  CertificateNotificationJobsService,
  CERTIFICATE_NOTIFICATION_QUEUE,
} from './certificate/certificate-notification-jobs.service';
import {
  ONLINE_ATTENDANCE_NOTIFICATION_QUEUE,
  OnlineAttendanceNotificationJobsService,
} from './attendance/online-attendance-notification-jobs.service';
import { OnlineAttendanceNotificationJobsProcessor } from './attendance/online-attendance-notification-jobs.processor';
import { OnlineAttendanceNotificationScheduler } from './attendance/online-attendance-notification.scheduler';
import { CertificateTargetsService } from './certificate/certificate-targets.service';
import { CertificateValidationService } from './certificate/certificate-validation.service';
import { CertificatesResolver } from './certificate/certificates.resolver';
import { PublicCertificateValidationService } from './certificate/public-certificate-validation.service';
import { PrismaModule } from './prisma/prisma.module';
import { EventAttendancesController } from './events/attendances.controller';
import { AttendanceAnalyticsController } from './events/attendance-analytics.controller';
import {
  AttendanceAnalyticsResolver,
  AttendanceAnalyticsService,
  EventAttendanceCsvImportResolver,
  EventAttendancesMutationsResolver,
  EventAttendancesQueriesResolver,
  MajorEventSubscriptionCsvImportResolver,
} from './events/attendances';
import { EventAttendanceCollectorsResolver } from './events/attendance-collectors.resolver';
import { AttendanceCategoryService } from './events/attendance-category.service';
import { EventSubscriptionSyncService } from './events/event-subscription-sync.service';
import { EventSubscriptionCountersService } from './events/subscription-counters.service';
import { EventSubscriptionsResolver } from './events/subscriptions.resolver';
import { SubscriptionBadgeExportController } from './events/subscription-badge-export.controller';
import { SubscriptionBadgeExportService } from './events/subscription-badge-export.service';
import { EventDraftsResolver } from './events/event-drafts.resolver';
import { EventDraftsService } from './events/event-drafts.service';
import { EventPostCommitEffectsService } from './events/event-post-commit-effects.service';
import { EventFormsController } from './event-forms/event-forms.controller';
import { EventFormEditorService } from './event-forms/event-form-editor.service';
import { EventFormListingsService } from './event-forms/event-form-listings.service';
import { EventFormNotificationService } from './event-forms/event-form-notification.service';
import { EventFormPublicationWorkflowService } from './event-forms/event-form-publication-workflow.service';
import { EventFormResponsesService } from './event-forms/event-form-responses.service';
import { EventFormResultEventsService } from './event-forms/event-form-result-events.service';
import { EventFormResultsAccessService } from './event-forms/event-form-results-access.service';
import { SseReplayService } from './realtime/sse-replay.service';
import { EventFormsResolver } from './event-forms/event-forms.resolver';
import { EventFormsScheduler } from './event-forms/event-forms.scheduler';
import { EventFormsService } from './event-forms/event-forms.service';
import { CurrentUserCertificatesResolver } from './current-user/certificates/resolver';
import { CurrentUserCertificatesDownloadController } from './current-user/certificates/certificates-download.controller';
import { CurrentUserContextService } from './current-user/context.service';
import { CurrentUserEventMapperService } from './current-user/mapper.service';
import { AccountProfileUpdateController } from './current-user/profile-update.controller';
import { CurrentUserEventSubscriptionService } from './current-user/events/subscription.service';
import { CurrentUserEventAttendanceResolver } from './current-user/events/attendance.resolver';
import { CurrentUserAttendanceCollectionController } from './current-user/events/attendance-collection.controller';
import { CurrentUserAttendanceCollectionResolver } from './current-user/events/attendance-collection.resolver';
import {
  CurrentUserOnlineAttendanceRealtimeService,
  CurrentUserRealtimeEventsController,
} from './current-user/events/attendance-realtime.service';
import { CurrentUserEventSubscriptionsResolver } from './current-user/events/subscriptions.resolver';
import { CurrentUserMajorEventSubscriptionService } from './current-user/major-events/subscription.service';
import { CurrentUserMajorEventSubscriptionsResolver } from './current-user/major-events/subscriptions.resolver';
import { CurrentUserProfileResolver } from './current-user/profile/resolver';
import { CurrentUserPublicEventService } from './current-user/public-event.service';
import { CurrentUserSubscriptionFeedService } from './current-user/subscription-feed/service';
import { CurrentUserSubscriptionFeedResolver } from './current-user/subscription-feed/resolver';
import { CurrentUserDefaultRedirectService } from './current-user/default-redirect/current-user-default-redirect.service';
import { CurrentUserDefaultRedirectResolver } from './current-user/default-redirect/resolver';
import { CurrentUserMyDayResolver } from './current-user/my-day/resolver';
import { CurrentUserMyDayService } from './current-user/my-day/service';
import { DashboardInsightsResolver } from './dashboard/insights.resolver';
import { DASHBOARD_INSIGHTS_QUEUE, DashboardInsightsService } from './dashboard/insights.service';
import { PublicPlatformStatsResolver } from './public-platform-stats/public-platform-stats.resolver';
import {
  PUBLIC_PLATFORM_STATS_QUEUE,
  PublicPlatformStatsService,
} from './public-platform-stats/public-platform-stats.service';
import { EventGroupsResolver } from './event-groups/resolver';
import { EventLecturersResolver } from './events/lecturers.resolver';
import { EventsResolver } from './events/resolver';
import { MajorEventsResolver } from './major-events/resolver';
import { PublicEventsResolver } from './public-events/events.resolver';
import { PublicMajorEventsResolver } from './public-events/major-events.resolver';
import { PlacePresetsResolver } from './places/resolver';
import { MergeCandidateOperationsService } from './people/merge-candidates/operations.service';
import { MergeCandidatesResolver } from './people/merge-candidates/resolver';
import { PeopleResolver } from './people/resolver';
import { LecturerProfilesResolver } from './people/lecturer-profiles.resolver';
import { UsersResolver } from './users/resolver';
import { TypesenseSearchService } from './search/typesense-search.service';
import { S3Service } from './s3/s3.service';
import { MajorEventReceiptsController } from './major-event-receipts/major-event-receipts.controller';
import { MajorEventReceiptsProcessor } from './major-event-receipts/major-event-receipts.processor';
import { MajorEventReceiptsResolver } from './major-event-receipts/major-event-receipts.resolver';
import { MajorEventReceiptsService } from './major-event-receipts/major-event-receipts.service';
import { ReceiptQueueMapper } from './major-event-receipts/mappers/receipt-queue.mapper';
import { ReceiptAnalysisService } from './major-event-receipts/receipt-analysis.service';
import { MAJOR_EVENT_RECEIPTS_QUEUE } from './major-event-receipts/receipt.types';
import { ReceiptAdminQueueService } from './major-event-receipts/services/receipt-admin-queue.service';
import { ReceiptSubscriptionSyncService } from './major-event-receipts/services/receipt-subscription-sync.service';
import { ReceiptUploadService } from './major-event-receipts/services/receipt-upload.service';
import { ReceiptValidationService } from './major-event-receipts/services/receipt-validation.service';
import { NovuNotificationsService } from './notifications/novu-notifications.service';
import { NovuNotificationsController } from './notifications/novu-notifications.controller';
import { AccountManagerPrivacySyncService } from './privacy/account-manager-privacy-sync.service';
import { PrivacyController } from './privacy/privacy.controller';
import { TrackingController } from './privacy/tracking.controller';
import { AccountManagerTotpService } from './totp/account-manager-totp.service';
import { TotpController } from './totp/totp.controller';
import { PublicationProcessor } from './publishing/publishing.processor';
import { PublicationResolver } from './publishing/publishing.resolver';
import { PublicationScheduler } from './publishing/publishing.scheduler';
import { PUBLICATION_QUEUE } from './publishing/publishing.constants';
import { PublicationJobsService } from './publishing/publishing-jobs.service';
import { PublicationPreviewContentService } from './publishing/publishing-preview-content.service';
import { PublicationPreviewService } from './publishing/publishing-preview.service';
import { PublicationSearchSyncService } from './publishing/publishing-search-sync.service';
import { PublicationService } from './publishing/publishing.service';
import { PublicationStateWriterService } from './publishing/publishing-state-writer.service';
import { PublicationTargetService } from './publishing/publishing-target.service';
import { PublicationTransitionService } from './publishing/publishing-transition.service';
import { getRedisConnectionOptions } from './weather/redis-connection';
import { WeatherProcessor } from './weather/weather.processor';
import { WeatherResolver } from './weather/weather.resolver';
import { WeatherSchedulerService } from './weather/weather-scheduler.service';
import { WeatherService } from './weather/weather.service';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { createGraphqlResourceLimitsPlugin } from './graphql-resource-limits.plugin';
import { AnalyticsModule } from './analytics/analytics.module';
import { VotingIntegrationController } from './voting-integration/controller';
import { VotingIntegrationService } from './voting-integration/service';
import { TurnstileService } from './turnstile/turnstile.service';
import { RateLimitGuard } from './rate-limit/rate-limit.guard';
import { RateLimitService } from './rate-limit/rate-limit.service';
import { validateBackendEnvironment } from './config/environment.validation';
import { redisProvider } from './redis/redis.provider';
import { createNoopQueueProviders } from './queues/noop-queue.providers';
import { BackendFeatureFlagService } from './feature-flags/backend-feature-flags';
import { ServerVersionResolver } from './server-version/server-version.resolver';
import { EventSitemapResolver } from './public-events/event-sitemap.resolver';
import { EventSitemapService } from './public-events/event-sitemap.service';
import { AccountManagerGrpcClient } from './grpc/account-manager-grpc.client';
import { SportsPlayerApplicationService } from './sports/applications/sports-player-application.service';
import {
  SportsPlayerApplicationAdminReadResolver,
  SportsPlayerApplicationCurrentUserReadResolver,
} from './sports/applications/sports-player-application-read.resolver';
import { SportsPlayerApplicationReadService } from './sports/applications/sports-player-application-read.service';
import { SportsPlayerApplicationRealtimeController } from './sports/applications/sports-player-application-realtime.controller';
import { SportsPlayerApplicationRealtimeService } from './sports/applications/sports-player-application-realtime.service';
import { SportsBracketAdvancementService } from './sports/brackets/sports-bracket-advancement.service';
import { SportsBracketService } from './sports/brackets/sports-bracket.service';
import { SportsDuplicationService } from './sports/duplication/sports-duplication.service';
import { SportsTeamDuplicationService } from './sports/duplication/sports-team-duplication.service';
import {
  PublicSportsTeamLogoController,
  SportsTeamRepresentativeLogoController,
  SportsTeamLogoController,
} from './sports/logos/sports-team-logo.controller';
import { SportsTeamLogoService } from './sports/logos/sports-team-logo.service';
import { SportsMatchOperationService } from './sports/operations/sports-match-operation.service';
import { SportsMatchOverlayController } from './sports/overlays/sports-match-overlay.controller';
import { SportsMatchOverlayService } from './sports/overlays/sports-match-overlay.service';
import {
  SportsAdminReadResolver,
  SportsCurrentUserReadResolver,
  SportsPublicReadResolver,
} from './sports/read/sports-read.resolver';
import { SportsReadService } from './sports/read/sports-read.service';
import { SportsRealtimeController } from './sports/realtime/sports-realtime.controller';
import { SportsRealtimeService } from './sports/realtime/sports-realtime.service';
import { SportsMutationEventsService } from './sports/realtime/sports-mutation-events.service';
import { SportsBackingResourceLifecycleService } from './sports/sports-backing-resource-lifecycle.service';
import { SportsMatchRosterService } from './sports/rosters/sports-match-roster.service';
import { SportsAutoroutingResolver } from './sports/routing/sports-autorouting.resolver';
import { SportsAutoroutingService } from './sports/routing/sports-autorouting.service';
import { SportsStandingsService } from './sports/scoring/sports-standings.service';
import { SportsAccessService } from './sports/security/sports-access.service';
import { SportsIdentityProtectionService } from './sports/security/sports-identity-protection.service';
import { SportsAdminService } from './sports/sports-admin.service';
import {
  SportsDuplicationMutationsResolver,
  SportsLifecycleMutationsResolver,
  SportsMatchAdminMutationsResolver,
  SportsParticipantMutationsResolver,
  SportsReviewMutationsResolver,
  SportsTeamMutationsResolver,
  SportsTournamentMutationsResolver,
} from './sports/sports-mutations.resolver';
import { SportsPaymentService } from './sports/sports-payment.service';
import { SportsTeamChangeService } from './sports/teams/sports-team-change.service';

const useInMemoryTestInfra = process.env.BACKEND_E2E_IN_MEMORY_INFRA === 'true';
const backendQueueNames = [
  'weather',
  DASHBOARD_INSIGHTS_QUEUE,
  PUBLIC_PLATFORM_STATS_QUEUE,
  MAJOR_EVENT_RECEIPTS_QUEUE,
  CALENDAR_FEED_MAINTENANCE_QUEUE,
  PUBLICATION_QUEUE,
  CERTIFICATE_NOTIFICATION_QUEUE,
  ONLINE_ATTENDANCE_NOTIFICATION_QUEUE,
  LGPD_STORAGE_CLEANUP_QUEUE,
];
const queueImports = useInMemoryTestInfra
  ? []
  : [
      BullModule.forRoot({
        connection: getRedisConnectionOptions(),
      }),
      BullModule.registerQueue({
        name: 'weather',
      }),
      BullModule.registerQueue({
        name: DASHBOARD_INSIGHTS_QUEUE,
      }),
      BullModule.registerQueue({
        name: PUBLIC_PLATFORM_STATS_QUEUE,
      }),
      BullModule.registerQueue({
        name: MAJOR_EVENT_RECEIPTS_QUEUE,
      }),
      BullModule.registerQueue({
        name: CALENDAR_FEED_MAINTENANCE_QUEUE,
      }),
      BullModule.registerQueue({
        name: PUBLICATION_QUEUE,
      }),
      BullModule.registerQueue({
        name: CERTIFICATE_NOTIFICATION_QUEUE,
      }),
      BullModule.registerQueue({
        name: ONLINE_ATTENDANCE_NOTIFICATION_QUEUE,
      }),
      BullModule.registerQueue({
        name: LGPD_STORAGE_CLEANUP_QUEUE,
      }),
    ];
const queueProviders = useInMemoryTestInfra ? createNoopQueueProviders(backendQueueNames) : [];
const queueProcessorProviders = useInMemoryTestInfra
  ? []
  : [
      CalendarFeedMaintenanceProcessor,
      PublicationProcessor,
      MajorEventReceiptsProcessor,
      WeatherProcessor,
      CertificateNotificationJobsProcessor,
      OnlineAttendanceNotificationJobsProcessor,
      LgpdStorageCleanupProcessor,
    ];
const schedulerProviders = useInMemoryTestInfra
  ? []
  : [
      CalendarFeedMaintenanceScheduler,
      PublicationScheduler,
      EventFormsScheduler,
      WeatherSchedulerService,
      OnlineAttendanceNotificationScheduler,
    ];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateBackendEnvironment,
    }),
    PrismaModule,
    AuthModule,
    ...queueImports,
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [AuthModule],
      inject: [KeycloakAuthService],
      useFactory: (keycloakAuthService: KeycloakAuthService) => ({
        autoSchemaFile: true,
        sortSchema: true,
        path: '/graphql',
        useGlobalPrefix: true,
        playground: false,
        allowBatchedHttpRequests: false,
        introspection: true,
        plugins: [
          createGraphqlResourceLimitsPlugin(),
          ApolloServerPluginLandingPageLocalDefault({
            embed: {
              endpointIsEditable: false,
              runTelemetry: false,
              initialState: {
                pollForSchemaUpdates: true,
              },
            },
            includeCookies: true,
          }),
          createIntrospectionAuthPlugin({
            keycloakAuthService,
            production: process.env.NODE_ENV === 'production',
          }),
        ],
        context: ({ req, res }: { req: Request; res: Response }) => ({ req, res }),
      }),
    }),
    AnalyticsModule,
  ],
  controllers: [
    AppController,
    HealthController,
    AccountMergeController,
    LgpdController,
    CurrentUserRealtimeEventsController,
    CurrentUserAttendanceCollectionController,
    CalendarController,
    AccountProfileUpdateController,
    EventAttendancesController,
    AttendanceAnalyticsController,
    SubscriptionBadgeExportController,
    EventFormsController,
    MajorEventReceiptsController,
    NovuNotificationsController,
    PrivacyController,
    TrackingController,
    TotpController,
    VotingIntegrationController,
    CurrentUserCertificatesDownloadController,
    SportsRealtimeController,
    SportsPlayerApplicationRealtimeController,
    SportsTeamLogoController,
    PublicSportsTeamLogoController,
    SportsTeamRepresentativeLogoController,
    SportsMatchOverlayController,
  ],
  providers: [
    HealthService,
    NovuNotificationsService,
    BackendFeatureFlagService,
    OnlineAttendanceNotificationJobsService,
    AccountMergeService,
    LgpdService,
    LgpdStorageCleanupService,
    MajorEventsResolver,
    PublicMajorEventsResolver,
    EventGroupsResolver,
    PlacePresetsResolver,
    EventsResolver,
    EventDraftsResolver,
    EventDraftsService,
    EventPostCommitEffectsService,
    PublicEventsResolver,
    EventSitemapResolver,
    EventSitemapService,
    ServerVersionResolver,
    PublicPlatformStatsResolver,
    UsersResolver,
    PeopleResolver,
    LecturerProfilesResolver,
    PermissionManagementResolver,
    PermissionManagementService,
    AuditLogResolver,
    AuditLogService,
    CalendarResolver,
    CalendarService,
    PublicationResolver,
    PublicationService,
    PublicationTransitionService,
    PublicationPreviewService,
    PublicationJobsService,
    PublicationSearchSyncService,
    PublicationStateWriterService,
    PublicationTargetService,
    PublicationPreviewContentService,
    CurrentUserContextService,
    CurrentUserEventMapperService,
    CurrentUserPublicEventService,
    CurrentUserEventSubscriptionService,
    CurrentUserMajorEventSubscriptionService,
    CurrentUserSubscriptionFeedService,
    CurrentUserDefaultRedirectService,
    CurrentUserMyDayService,
    CurrentUserCertificatesResolver,
    CurrentUserProfileResolver,
    CurrentUserMajorEventSubscriptionsResolver,
    CurrentUserEventSubscriptionsResolver,
    CurrentUserEventAttendanceResolver,
    CurrentUserAttendanceCollectionResolver,
    CurrentUserOnlineAttendanceRealtimeService,
    CurrentUserSubscriptionFeedResolver,
    CurrentUserDefaultRedirectResolver,
    CurrentUserMyDayResolver,
    SportsTournamentMutationsResolver,
    SportsTeamMutationsResolver,
    SportsMatchAdminMutationsResolver,
    SportsLifecycleMutationsResolver,
    SportsReviewMutationsResolver,
    SportsDuplicationMutationsResolver,
    SportsParticipantMutationsResolver,
    SportsPlayerApplicationAdminReadResolver,
    SportsPlayerApplicationCurrentUserReadResolver,
    SportsAdminReadResolver,
    SportsPublicReadResolver,
    SportsCurrentUserReadResolver,
    SportsAutoroutingResolver,
    SportsAdminService,
    SportsAccessService,
    SportsIdentityProtectionService,
    SportsPaymentService,
    SportsPlayerApplicationService,
    SportsPlayerApplicationReadService,
    SportsPlayerApplicationRealtimeService,
    SportsTeamChangeService,
    SportsMatchRosterService,
    SportsBracketAdvancementService,
    SportsBracketService,
    SportsStandingsService,
    SportsMatchOperationService,
    SportsRealtimeService,
    SportsMutationEventsService,
    SportsBackingResourceLifecycleService,
    SportsAutoroutingService,
    SportsDuplicationService,
    SportsTeamDuplicationService,
    SportsReadService,
    SportsTeamLogoService,
    SportsMatchOverlayService,
    DashboardInsightsResolver,
    DashboardInsightsService,
    PublicPlatformStatsService,
    AttendanceCategoryService,
    AttendanceAnalyticsService,
    AttendanceAnalyticsResolver,
    EventSubscriptionSyncService,
    EventSubscriptionCountersService,
    EventAttendanceCollectorsResolver,
    EventAttendanceCsvImportResolver,
    EventAttendancesMutationsResolver,
    EventAttendancesQueriesResolver,
    MajorEventSubscriptionCsvImportResolver,
    EventSubscriptionsResolver,
    SubscriptionBadgeExportService,
    EventFormsResolver,
    EventFormEditorService,
    EventFormListingsService,
    EventFormsService,
    EventFormNotificationService,
    EventFormPublicationWorkflowService,
    EventFormResponsesService,
    EventFormResultEventsService,
    SseReplayService,
    EventFormResultsAccessService,
    EventLecturersResolver,
    MergeCandidatesResolver,
    MergeCandidateOperationsService,
    TypesenseSearchService,
    S3Service,
    MajorEventReceiptsResolver,
    MajorEventReceiptsService,
    ReceiptAdminQueueService,
    ReceiptQueueMapper,
    ReceiptSubscriptionSyncService,
    ReceiptUploadService,
    ReceiptValidationService,
    ReceiptAnalysisService,
    AccountManagerPrivacySyncService,
    AccountManagerTotpService,
    AccountManagerGrpcClient,
    CertificatesResolver,
    WeatherResolver,
    CertificateTargetsService,
    CertificateValidationService,
    CertificateConfigsService,
    CertificateCsvImportResolver,
    CertificateDownloadService,
    CertificateTemplateRegistryService,
    CertificateEligibilityService,
    CertificateSportsEligibility,
    CertificateIssuingService,
    CertificateNotificationJobsService,
    LegacyRepeatableJobsMigrationService,
    PublicCertificateValidationService,
    WeatherService,
    FrozenResourceService,
    VotingIntegrationService,
    TurnstileService,
    RateLimitGuard,
    RateLimitService,
    redisProvider,
    ...queueProviders,
    ...queueProcessorProviders,
    ...schedulerProviders,
    {
      provide: APP_GUARD,
      useClass: KeycloakScopeGuard,
    },
  ],
})
export class AppModule {}
