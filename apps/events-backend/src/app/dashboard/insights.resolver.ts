import { Context, Query, Resolver } from '@nestjs/graphql';
import { GraphqlContext } from '../current-user/selects';
import { DashboardInsightsService } from './insights.service';
import { WorkspaceDashboardInsights } from './models';

@Resolver()
export class DashboardInsightsResolver {
  constructor(private readonly insightsService: DashboardInsightsService) {}

  @Query(() => WorkspaceDashboardInsights, {
    name: 'workspaceDashboardInsights',
  })
  workspaceDashboardInsights(@Context() context: GraphqlContext): Promise<WorkspaceDashboardInsights> {
    return this.insightsService.getWorkspaceDashboardInsights(context);
  }
}
