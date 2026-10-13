import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import type {
  TransferApplyRequest,
  TransferExport,
  TransferExportRequest,
  TransferPreview,
  TransferPreviewRequest,
  TransferBatchSummary,
  TransferResult,
  TransferUndoResult,
} from '@cacic-fct/shared-data-transfer';
import { Observable } from 'rxjs';

const endpoint = '/api/admin/data-transfer';

@Service()
export class DataTransferApiService {
  private readonly http = inject(HttpClient);

  getSchema(): Observable<unknown> {
    return this.http.get<unknown>(`${endpoint}/schema`);
  }

  export(request: TransferExportRequest): Observable<TransferExport> {
    return this.http.post<TransferExport>(`${endpoint}/export`, request);
  }

  preview(request: TransferPreviewRequest): Observable<TransferPreview> {
    return this.http.post<TransferPreview>(`${endpoint}/preview`, request);
  }

  apply(request: TransferApplyRequest): Observable<TransferResult> {
    return this.http.post<TransferResult>(`${endpoint}/apply`, request);
  }

  undo(batchId: string): Observable<TransferUndoResult> {
    return this.http.post<TransferUndoResult>(`${endpoint}/undo`, { batchId });
  }

  history(): Observable<TransferBatchSummary[]> {
    return this.http.get<TransferBatchSummary[]>(`${endpoint}/history`);
  }
}
