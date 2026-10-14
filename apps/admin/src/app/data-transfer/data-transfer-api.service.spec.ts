import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type {
  TransferApplyRequest,
  TransferExportRequest,
  TransferPreviewRequest,
} from '@cacic-fct/shared-data-transfer';
import { DataTransferApiService } from './data-transfer-api.service';

describe('DataTransferApiService', () => {
  let api: DataTransferApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(DataTransferApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the server JSON Schema', () => {
    let schema: unknown;
    api.getSchema().subscribe((value) => (schema = value));

    const request = http.expectOne('/api/admin/data-transfer/schema');
    expect(request.request.method).toBe('GET');
    request.flush({ type: 'object', title: 'CACiC event tree' });

    expect(schema).toEqual({ type: 'object', title: 'CACiC event tree' });
  });

  it('sends the explicit export scope and related data options', () => {
    const body: TransferExportRequest = {
      target: { kind: 'major-event', id: 'major-1' },
      includeDescendants: true,
      includeConfiguration: true,
      includeSubscriptions: false,
      includeAttendances: false,
      includeChildSubscriptions: true,
      includeChildAttendances: false,
    };
    api.export(body).subscribe();

    const request = http.expectOne('/api/admin/data-transfer/export');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    request.flush({ document: { format: 'cacic-event-data', version: 1, resources: [] }, issues: [] });
  });

  it('previews a document against the optional existing context scope', () => {
    const body: TransferPreviewRequest = {
      document: { format: 'cacic-event-data', version: 1, resources: [] },
      scope: { kind: 'event', id: 'event-1' },
    };
    api.preview(body).subscribe();

    const request = http.expectOne('/api/admin/data-transfer/preview');
    expect(request.request.body).toEqual(body);
    request.flush({
      items: [],
      summary: { create: 0, update: 0, unchanged: 0, skip: 0 },
      planHash: 'plan',
      canApply: false,
    });
  });

  it('applies only the plan hash that the user reviewed', () => {
    const body: TransferApplyRequest = {
      document: { format: 'cacic-event-data', version: 1, resources: [] },
      scope: { kind: 'group', id: 'group-1' },
      planHash: 'reviewed-plan',
      allowPartial: false,
      allocationToken: 'reviewed-allocation',
    };
    api.apply(body).subscribe();

    const request = http.expectOne('/api/admin/data-transfer/apply');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    request.flush({
      applied: true,
      items: [],
      summary: { create: 0, update: 0, unchanged: 0, skip: 0 },
      planHash: 'reviewed-plan',
      canApply: false,
    });
  });

  it('undoes a committed import by its batch identity', () => {
    api.undo('batch-1').subscribe();

    const request = http.expectOne('/api/admin/data-transfer/undo');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ batchId: 'batch-1' });
    request.flush({ batchId: 'batch-1', auditEntryId: 'audit-1', undone: true });
  });

  it('loads authorized recent import history', () => {
    api.history().subscribe();

    const request = http.expectOne('/api/admin/data-transfer/history');
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });
});
