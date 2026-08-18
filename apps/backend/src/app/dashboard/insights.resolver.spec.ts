import { DashboardInsightsResolver } from './insights.resolver';

describe('DashboardInsightsResolver', () => {
  it('forwards the complete GraphQL context to permission-aware insight loading', async () => {
    const insights = { publication: { draft: 1 } };
    const getWorkspaceDashboardInsights = jest.fn().mockResolvedValue(insights);
    const resolver = new DashboardInsightsResolver({ getWorkspaceDashboardInsights } as never);
    const context = { req: { user: { sub: 'admin-1' } } };

    await expect(resolver.workspaceDashboardInsights(context as never)).resolves.toBe(insights);
    expect(getWorkspaceDashboardInsights).toHaveBeenCalledWith(context);
  });
});
