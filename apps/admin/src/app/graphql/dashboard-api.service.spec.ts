import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { createAdminWorkspaceDashboardInsights } from '../testing/admin-entity-fixtures';
import { DashboardApiService } from './dashboard-api.service';
import { GraphqlHttpService } from './graphql-http.service';

describe('DashboardApiService', () => {
  let graphqlHttp: { request: ReturnType<typeof vi.fn> };
  let service: DashboardApiService;

  beforeEach(() => {
    graphqlHttp = {
      request: vi.fn(() => of({ workspaceDashboardInsights: dashboardFixture() })),
    };

    TestBed.configureTestingModule({
      providers: [DashboardApiService, { provide: GraphqlHttpService, useValue: graphqlHttp }],
    });

    service = TestBed.inject(DashboardApiService);
  });

  it('requests the workspace dashboard and extracts the response payload', async () => {
    const expected = dashboardFixture();

    await expect(firstValueFrom(service.getWorkspaceDashboardInsights())).resolves.toEqual(expected);

    expect(graphqlHttp.request).toHaveBeenCalledWith(expect.stringContaining('query WorkspaceDashboardInsights'));
    const query = graphqlHttp.request.mock.calls[0][0] as string;
    expect(query).toContain('workspaceDashboardInsights');
    expect(query).toContain('pendingReceiptValidationsCount');
    expect(query).toContain('sportsMatches');
  });

  it('propagates GraphQL errors without changing them', async () => {
    const error = new Error('dashboard unavailable');
    graphqlHttp.request.mockReturnValueOnce(throwError(() => error));

    await expect(firstValueFrom(service.getWorkspaceDashboardInsights())).rejects.toBe(error);
  });
});

function dashboardFixture() {
  return createAdminWorkspaceDashboardInsights();
}
