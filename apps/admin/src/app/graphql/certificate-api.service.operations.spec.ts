import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { createAdminPerson } from '../testing/admin-entity-fixtures';
import { CertificateApiService } from './certificate-api.service';
import { GraphqlHttpService } from './graphql-http.service';

describe('CertificateApiService operation contracts', () => {
  let graphqlHttp: { request: ReturnType<typeof vi.fn> };
  let service: CertificateApiService;

  beforeEach(() => {
    graphqlHttp = {
      request: vi.fn((query: string) => {
        if (query.includes('IssueManualCertificatesFromCsv')) {
          return of({ issueManualCertificatesFromCsv: csvImportFixture() });
        }
        return of({ issueManualCertificatesFromCsv: csvImportFixture() });
      }),
    };

    TestBed.configureTestingModule({
      providers: [CertificateApiService, { provide: GraphqlHttpService, useValue: graphqlHttp }],
    });

    service = TestBed.inject(CertificateApiService);
  });

  it('maps manual certificate CSV input and extracts the import result', async () => {
    const input = {
      configId: 'config-1',
      csvContent: 'email\nada@example.com',
      selectedHeader: 'email',
    };

    await expect(firstValueFrom(service.issueManualCertificatesFromCsv(input))).resolves.toEqual(csvImportFixture());

    expect(graphqlHttp.request).toHaveBeenCalledWith(expect.stringContaining('mutation IssueManualCertificatesFromCsv'), {
      input,
    });
    const mutation = graphqlHttp.request.mock.calls[0][0] as string;
    expect(mutation).toContain('issueManualCertificatesFromCsv');
    expect(mutation).toContain('ambiguousValues');
  });

  it('propagates manual certificate import failures', async () => {
    const error = new Error('certificate import failed');
    graphqlHttp.request.mockReturnValueOnce(throwError(() => error));

    await expect(
      firstValueFrom(
        service.issueManualCertificatesFromCsv({
          configId: 'config-1',
          csvContent: 'email\nada@example.com',
          selectedHeader: 'email',
        }),
      ),
    ).rejects.toBe(error);
  });
});

function csvImportFixture() {
  return {
    createdCount: 1,
    duplicateCount: 0,
    failedCount: 0,
    failedValues: [],
    inferredMatchType: 'EMAIL',
    ambiguousValues: [
      {
        value: 'ada@example.com',
        candidates: [
          {
            ...createAdminPerson({ id: 'person-1', name: 'Ada Lovelace', email: 'ada@example.com' }),
          },
        ],
      },
    ],
  };
}
