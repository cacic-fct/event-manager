import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { redisProvider } from '../redis/redis.provider';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, RateLimitGuard, RateLimitService, redisProvider],
})
export class AnalyticsModule {}
