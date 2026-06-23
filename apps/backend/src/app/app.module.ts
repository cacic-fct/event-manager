import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import Redis from 'ioredis';
import { AppController } from './app.controller';
import { AccountMergeController } from './account-merge/account-merge.controller';
import { AccountMergeService } from './account-merge/account-merge.service';
import { AuditLogResolver } from './audit-log/audit-log.resolver';
import { AuditLogService } from './audit-log/audit-log.service';
import { AuthModule } from './auth/auth.module';
import { PermissionGrantsResolver } from './authorization/permission-grants.resolver';
import { PermissionGrantsService } from './authorization/permission-grants.service';
import { KeycloakScopeGuard } from './auth/guards/keycloak-scope.guard';
import { KeycloakAuthService } from './auth/keycloak-auth.service';
import { createIntrospectionAuthPlugin } from './auth/introspection-auth.plugin';
import { LgpdController } from './lgpd/lgpd.controller';
import { LgpdService } from './lgpd/lgpd.service';
import { GqlThrottlerGuard } from './common/gql-throttler.guard';
import { FrozenResourceService } from './common/frozen-resource.service';
import { CertificateConfigsService } from './certificate/certificate-configs.service';
import { CertificateDownloadService } from './certificate/certificate-download.service';
import { CertificateEligibilityService } from './certificate/certificate-eligibility.service';
import { CertificateIssuingService } from './certificate/certificate-issuing.service';
import { CertificateTargetsService } from './certificate/certificate-targets.service';
import { CertificateValidationService } from './certificate/certificate-validation.service';
import { CertificatesResolver } from './certificate/certificates.resolver';
import { PublicCertificateValidationService } from './certificate/public-certificate-validation.service';
import { PrismaModule } from './prisma/prisma.module';
import { EventAttendancesController } from './events/attendances.controller';
import {
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
import { CurrentUserCertificatesResolver } from './current-user/certificates/resolver';
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
import { DashboardInsightsProcessor } from './dashboard/insights.processor';
import { DashboardInsightsResolver } from './dashboard/insights.resolver';
import { DashboardInsightsSchedulerService } from './dashboard/insights-scheduler.service';
import { DASHBOARD_INSIGHTS_QUEUE, DashboardInsightsService } from './dashboard/insights.service';
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
import { getRedisConnectionOptions } from './weather/redis-connection';
import { WeatherProcessor } from './weather/weather.processor';
import { WeatherResolver } from './weather/weather.resolver';
import { WeatherSchedulerService } from './weather/weather-scheduler.service';
import { WeatherService } from './weather/weather.service';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { AnalyticsModule } from './analytics/analytics.module';
import { VotingIntegrationController } from './voting-integration/controller';
import { VotingIntegrationService } from './voting-integration/service';
import { ReceiptUploadTurnstileGuard } from './turnstile/receipt-upload-turnstile.guard';
import { TurnstileService } from './turnstile/turnstile.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
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
      name: MAJOR_EVENT_RECEIPTS_QUEUE,
    }),
    ThrottlerModule.forRoot({
      setHeaders: false,
      throttlers: [
        {
          ttl: 60_000,
          limit: 100,
        },
        {
          name: 'publicCertificateValidation',
          limit: 20,
          ttl: 60_000,
          blockDuration: 60_000,
        },
        {
          name: 'publicEvents',
          limit: 60,
          ttl: 60_000,
          blockDuration: 60_000,
        },
      ],
    }),
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
        introspection: true,
        plugins: [
          ApolloServerPluginLandingPageLocalDefault({
            embed: false,
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
    AccountMergeController,
    LgpdController,
    CurrentUserRealtimeEventsController,
    CurrentUserAttendanceCollectionController,
    AccountProfileUpdateController,
    EventAttendancesController,
    MajorEventReceiptsController,
    NovuNotificationsController,
    PrivacyController,
    VotingIntegrationController,
  ],
  providers: [
    NovuNotificationsService,
    AccountMergeService,
    LgpdService,
    MajorEventsResolver,
    PublicMajorEventsResolver,
    EventGroupsResolver,
    PlacePresetsResolver,
    EventsResolver,
    PublicEventsResolver,
    UsersResolver,
    PeopleResolver,
    LecturerProfilesResolver,
    PermissionGrantsResolver,
    PermissionGrantsService,
    AuditLogResolver,
    AuditLogService,
    CurrentUserContextService,
    CurrentUserEventMapperService,
    CurrentUserPublicEventService,
    CurrentUserEventSubscriptionService,
    CurrentUserMajorEventSubscriptionService,
    CurrentUserSubscriptionFeedService,
    CurrentUserCertificatesResolver,
    CurrentUserProfileResolver,
    CurrentUserMajorEventSubscriptionsResolver,
    CurrentUserEventSubscriptionsResolver,
    CurrentUserEventAttendanceResolver,
    CurrentUserAttendanceCollectionResolver,
    CurrentUserOnlineAttendanceRealtimeService,
    CurrentUserSubscriptionFeedResolver,
    DashboardInsightsResolver,
    DashboardInsightsService,
    DashboardInsightsSchedulerService,
    DashboardInsightsProcessor,
    AttendanceCategoryService,
    EventSubscriptionSyncService,
    EventSubscriptionCountersService,
    EventAttendanceCollectorsResolver,
    EventAttendanceCsvImportResolver,
    EventAttendancesMutationsResolver,
    EventAttendancesQueriesResolver,
    MajorEventSubscriptionCsvImportResolver,
    EventSubscriptionsResolver,
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
    MajorEventReceiptsProcessor,
    ReceiptAnalysisService,
    AccountManagerPrivacySyncService,
    CertificatesResolver,
    WeatherResolver,
    CertificateTargetsService,
    CertificateValidationService,
    CertificateConfigsService,
    CertificateDownloadService,
    CertificateEligibilityService,
    CertificateIssuingService,
    PublicCertificateValidationService,
    WeatherService,
    WeatherSchedulerService,
    WeatherProcessor,
    FrozenResourceService,
    VotingIntegrationService,
    ReceiptUploadTurnstileGuard,
    TurnstileService,
    {
      provide: Redis,
      useFactory: () => new Redis(getRedisConnectionOptions()),
    },
    GqlThrottlerGuard,
    {
      provide: APP_GUARD,
      useClass: KeycloakScopeGuard,
    },
  ],
})
export class AppModule {}
