import type { UsageDashboard, UsageReport } from '@cacic-fct/shared-analytics';
import { Permission } from '@cacic-fct/shared-permissions';
import { Context, Field, Float, ObjectType, Query, Resolver } from '@nestjs/graphql';
import type { Response } from 'express';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { UmamiAnalyticsService } from './umami-analytics.service';

@ObjectType('UsageMetric')
class UsageMetricModel {
  @Field(() => String)
  name!: string;

  @Field(() => Float)
  count!: number;
}

@ObjectType('UsageMetricSource')
class UsageMetricSourceModel {
  @Field(() => String)
  source!: string;

  @Field(() => [UsageMetricModel])
  events!: UsageMetricModel[];
}

@ObjectType('UsageReport')
class UsageReportModel {
  @Field(() => Float)
  startAt!: number;

  @Field(() => Float)
  endAt!: number;

  @Field(() => [UsageMetricSourceModel])
  sources!: UsageMetricSourceModel[];
}

@ObjectType('UsageDashboard')
class UsageDashboardModel {
  @Field(() => String)
  source!: string;

  @Field(() => String)
  url!: string;
}

@Resolver()
@RequirePermissions(Permission.UsageMetrics.Read)
export class UsageReportResolver {
  constructor(private readonly analytics: UmamiAnalyticsService) {}

  @Query(() => UsageReportModel, {
    nullable: true,
    description: 'Seven days of aggregate usage and operations counts.',
  })
  usageReport(@Context('res') response: Response): Promise<UsageReport | null> {
    response.setHeader('Cache-Control', 'private, no-store');
    return this.analytics.getReport();
  }

  @Query(() => [UsageDashboardModel], { description: 'Private Umami dashboard links by source.' })
  usageDashboards(): UsageDashboard[] {
    return this.analytics.getDashboards();
  }
}
