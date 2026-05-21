import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ThrottlerModule } from '@nestjs/throttler';
import Redis from 'ioredis';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AccountMergeController } from './account-merge/account-merge.controller';
import { AccountMergeService } from './account-merge/account-merge.service';
import { AuthModule } from './auth/auth.module';
import { KeycloakScopeGuard } from './auth/guards/keycloak-scope.guard';
import { LgpdController } from './lgpd/lgpd.controller';
import { LgpdService } from './lgpd/lgpd.service';
import { GqlThrottlerGuard } from './common/gql-throttler.guard';
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
import { EventAttendancesResolver } from './events/attendances.resolver';
import { EventAttendanceCollectorsResolver } from './events/attendance-collectors.resolver';
import { AttendanceCategoryService } from './events/attendance-category.service';
import { EventSubscriptionsResolver } from './events/subscriptions.resolver';
import { CurrentUserCertificatesResolver } from './current-user/certificates/resolver';
import { CurrentUserContextService } from './current-user/context.service';
import { CurrentUserEventMapperService } from './current-user/mapper.service';
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
import { MergeCandidateOperationsService } from './people/merge-candidates/operations.service';
import { MergeCandidatesResolver } from './people/merge-candidates/resolver';
import { PeopleResolver } from './people/resolver';
import { UsersResolver } from './users/resolver';
import { TypesenseSearchService } from './search/typesense-search.service';
import { S3Service } from './s3/s3.service';
import { MajorEventReceiptsController } from './major-event-receipts/major-event-receipts.controller';
import { MajorEventReceiptsProcessor } from './major-event-receipts/major-event-receipts.processor';
import { MajorEventReceiptsService } from './major-event-receipts/major-event-receipts.service';
import { ReceiptAnalysisService } from './major-event-receipts/receipt-analysis.service';
import { MAJOR_EVENT_RECEIPTS_QUEUE } from './major-event-receipts/receipt.types';
import { NovuNotificationsService } from './notifications/novu-notifications.service';
import { AccountManagerPrivacySyncService } from './privacy/account-manager-privacy-sync.service';
import { PrivacyController } from './privacy/privacy.controller';
import { getRedisConnectionOptions } from './weather/redis-connection';
import { WeatherProcessor } from './weather/weather.processor';
import { WeatherResolver } from './weather/weather.resolver';
import { WeatherSchedulerService } from './weather/weather-scheduler.service';
import { WeatherService } from './weather/weather.service';

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
      ],
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      sortSchema: true,
      path: '/graphql',
      useGlobalPrefix: true,
      context: ({ req, res }) => ({ req, res }),
    }),
  ],
  controllers: [
    AppController,
    AccountMergeController,
    LgpdController,
    CurrentUserRealtimeEventsController,
    CurrentUserAttendanceCollectionController,
    EventAttendancesController,
    MajorEventReceiptsController,
    PrivacyController,
  ],
  providers: [
    AppService,
    NovuNotificationsService,
    AccountMergeService,
    LgpdService,
    MajorEventsResolver,
    PublicMajorEventsResolver,
    EventGroupsResolver,
    EventsResolver,
    PublicEventsResolver,
    UsersResolver,
    PeopleResolver,
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
    EventAttendanceCollectorsResolver,
    EventAttendancesResolver,
    EventSubscriptionsResolver,
    EventLecturersResolver,
    MergeCandidatesResolver,
    MergeCandidateOperationsService,
    TypesenseSearchService,
    S3Service,
    MajorEventReceiptsService,
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
