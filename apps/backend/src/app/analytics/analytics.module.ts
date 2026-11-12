import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { redisProvider } from '../redis/redis.provider';
import { UmamiAnalyticsService } from './umami-analytics.service';
import { UsageReportResolver } from './usage-report.resolver';

@Module({
  controllers: [AnalyticsController],
  exports: [UmamiAnalyticsService],
  providers: [
    AnalyticsService,
    UmamiAnalyticsService,
    UsageReportResolver,
    RateLimitGuard,
    RateLimitService,
    redisProvider,
  ],
})
export class AnalyticsModule {}
