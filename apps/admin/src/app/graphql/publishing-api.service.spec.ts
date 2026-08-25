import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { adminFixtureDate, adminFixtureDateFromNow } from '../testing/admin-entity-fixtures';
import { GraphqlHttpService } from './graphql-http.service';
import { PublicationApiService } from './publishing-api.service';

describe('PublicationApiService', () => {
  let graphqlHttp: { request: ReturnType<typeof vi.fn> };
  let service: PublicationApiService;

  beforeEach(() => {
    graphqlHttp = {
      request: vi.fn((query: string) => {
        if (query.includes('PublicationWorkspace')) {
          return of({ publicationWorkspace: workspaceFixture() });
        }
        if (query.includes('SetPublicationState')) {
          return of({ setPublicationState: actionFixture('published') });
        }
        if (query.includes('RunPublicationBulkOperation')) {
          return of({ runPublicationBulkOperation: actionFixture('bulk') });
        }
        return of({ createPublicationPreview: previewFixture() });
      }),
    };

    TestBed.configureTestingModule({
      providers: [PublicationApiService, { provide: GraphqlHttpService, useValue: graphqlHttp }],
    });

    service = TestBed.inject(PublicationApiService);
  });

  it('maps workspace reads and every publication mutation', async () => {
    const filters = {
      query: 'Semana',
      skip: 10,
      take: 25,
      focusTargetType: 'EVENT',
      focusTargetId: 'event-1',
    } as never;
    const stateInput = { targetType: 'EVENT', targetId: 'event-1', state: 'PUBLISHED' } as never;
    const bulkInput = {
      targetType: 'MAJOR_EVENT',
      targetId: 'major-1',
      operation: 'SCHEDULE_BUNDLE',
      scheduledPublishAt: adminFixtureDateFromNow(2),
    } as never;
    const previewInput = { targetType: 'EVENT', targetId: 'event-1', previewAt: null } as never;

    await expect(firstValueFrom(service.getWorkspace(filters))).resolves.toEqual(workspaceFixture());
    await expect(firstValueFrom(service.setPublicationState(stateInput))).resolves.toEqual(actionFixture('published'));
    await expect(firstValueFrom(service.runBulkOperation(bulkInput))).resolves.toEqual(actionFixture('bulk'));
    await expect(firstValueFrom(service.createPreview(previewInput))).resolves.toEqual(previewFixture());

    expect(graphqlHttp.request).toHaveBeenNthCalledWith(1, expect.stringContaining('query PublicationWorkspace'), {
      query: 'Semana',
      skip: 10,
      take: 25,
      focusTargetType: 'EVENT',
      focusTargetId: 'event-1',
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(2, expect.stringContaining('mutation SetPublicationState'), {
      input: stateInput,
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('mutation RunPublicationBulkOperation'),
      { input: bulkInput },
    );
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('mutation CreatePublicationPreview'),
      {
        input: previewInput,
      },
    );

    const workspaceQuery = graphqlHttp.request.mock.calls[0][0] as string;
    expect(workspaceQuery).toContain('publicationWorkspace');
    expect(workspaceQuery).toContain('warnings');
    expect(workspaceQuery).toContain('children');
  });

  it('omits workspace variables when no filters are supplied', async () => {
    await expect(firstValueFrom(service.getWorkspace())).resolves.toEqual(workspaceFixture());

    expect(graphqlHttp.request).toHaveBeenCalledWith(expect.stringContaining('query PublicationWorkspace'), undefined);
    expect(graphqlHttp.request.mock.calls[0]).toHaveLength(2);
  });

  it('propagates GraphQL errors from publication operations', async () => {
    const error = new Error('publication failed');
    graphqlHttp.request.mockReturnValueOnce(throwError(() => error));

    await expect(firstValueFrom(service.createPreview({} as never))).rejects.toBe(error);
  });
});

function workspaceFixture() {
  return {
    generatedAt: adminFixtureDate,
    tree: [],
    items: [],
    totalCount: 0,
    skip: 0,
    take: 25,
    hasMore: false,
    query: null,
    warnings: [],
  };
}

function actionFixture(message: string) {
  return {
    ok: true,
    message,
    affectedEventIds: ['event-1'],
    affectedMajorEventIds: ['major-1'],
  };
}

function previewFixture() {
  return {
    url: 'https://preview.example/event-1',
    directPublicUrl: false,
    expiresAt: adminFixtureDateFromNow(0, 13),
    message: 'Preview created',
  };
}
