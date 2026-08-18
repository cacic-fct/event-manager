import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { adminFixtureDate } from '../testing/admin-entity-fixtures';
import { GraphqlHttpService } from './graphql-http.service';
import { MergeCandidateApiService } from './merge-candidate-api.service';

describe('MergeCandidateApiService', () => {
  let graphqlHttp: { request: ReturnType<typeof vi.fn> };
  let service: MergeCandidateApiService;

  beforeEach(() => {
    graphqlHttp = {
      request: vi.fn((query: string) => {
        if (query.includes('ListMergeCandidates')) {
          return of({ mergeCandidates: [candidateFixture()] });
        }
        if (query.includes('UpdateMergeCandidate')) {
          return of({ updateMergeCandidate: candidateFixture({ status: 'RESOLVED' }) });
        }
        if (query.includes('DeleteMergeCandidate')) {
          return of({ deleteMergeCandidate: { deleted: true, id: 'candidate-1' } });
        }
        if (query.includes('ScanMergeCandidates')) {
          return of({ scanMergeCandidates: 7 });
        }
        if (query.includes('UndoMergeCandidatePeople')) {
          return of({ undoMergeCandidatePeople: candidateFixture({ status: 'PENDING' }) });
        }
        if (query.includes('MergeCandidatePeople')) {
          return of({ mergeCandidatePeople: candidateFixture({ status: 'MERGED' }) });
        }
        return of({ undoMergeCandidatePeople: candidateFixture({ status: 'PENDING' }) });
      }),
    };

    TestBed.configureTestingModule({
      providers: [MergeCandidateApiService, { provide: GraphqlHttpService, useValue: graphqlHttp }],
    });

    service = TestBed.inject(MergeCandidateApiService);
  });

  it('maps candidate queries and all merge lifecycle mutations', async () => {
    const filters = { status: 'PENDING', skip: 5, take: 20 } as never;
    const updateInput = { status: 'RESOLVED' } as never;
    const mergeInput = { candidateId: 'candidate-1', targetPersonId: 'person-a', migrateFields: ['NAME'] } as never;

    await expect(firstValueFrom(service.listMergeCandidates(filters))).resolves.toEqual([candidateFixture()]);
    await expect(firstValueFrom(service.updateMergeCandidate('candidate-1', updateInput))).resolves.toEqual(
      candidateFixture({ status: 'RESOLVED' }),
    );
    await expect(firstValueFrom(service.deleteMergeCandidate('candidate-1'))).resolves.toEqual({
      deleted: true,
      id: 'candidate-1',
    });
    await expect(firstValueFrom(service.scanMergeCandidates())).resolves.toBe(7);
    await expect(firstValueFrom(service.mergeCandidatePeople(mergeInput))).resolves.toEqual(
      candidateFixture({ status: 'MERGED' }),
    );
    await expect(firstValueFrom(service.undoMergeCandidatePeople('candidate-1'))).resolves.toEqual(
      candidateFixture({ status: 'PENDING' }),
    );

    expect(graphqlHttp.request).toHaveBeenNthCalledWith(1, expect.stringContaining('query ListMergeCandidates'), filters);
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(2, expect.stringContaining('mutation UpdateMergeCandidate'), {
      id: 'candidate-1',
      input: updateInput,
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(3, expect.stringContaining('mutation DeleteMergeCandidate'), {
      id: 'candidate-1',
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(4, expect.stringContaining('mutation ScanMergeCandidates'));
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(5, expect.stringContaining('mutation MergeCandidatePeople'), {
      input: mergeInput,
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(
      6,
      expect.stringContaining('mutation UndoMergeCandidatePeople'),
      { candidateId: 'candidate-1' },
    );
  });

  it('propagates GraphQL errors from merge operations', async () => {
    const error = new Error('merge operation failed');
    graphqlHttp.request.mockReturnValueOnce(throwError(() => error));

    await expect(firstValueFrom(service.scanMergeCandidates())).rejects.toBe(error);
  });
});

function candidateFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'candidate-1',
    personAId: 'person-a',
    personBId: 'person-b',
    pairKey: 'person-a:person-b',
    score: 0.95,
    matchMethod: 'EMAIL',
    matchValue: 'ada@example.edu',
    status: 'PENDING',
    resolvedById: null,
    createdAt: adminFixtureDate,
    updatedAt: adminFixtureDate,
    ...overrides,
  };
}
