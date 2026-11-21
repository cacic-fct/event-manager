import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AdminOperationsApi } from './admin-operations-api.service';

describe('AdminOperationsApi session boundary', () => {
  it('bypasses bearer interceptors and marks only cookie-session mutations for review', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([
            (request, next) => next(request.clone({ setHeaders: { Authorization: 'Bearer forbidden' } })),
          ]),
        ),
        provideHttpClientTesting(),
      ],
    });
    const api = TestBed.inject(AdminOperationsApi);
    const http = TestBed.inject(HttpTestingController);
    const catalog = api.catalog();
    const read = http.expectOne('/api/admin/mcp/operations/catalog');
    expect(read.request.withCredentials).toBe(true);
    expect(read.request.headers.has('Authorization')).toBe(false);
    expect(read.request.headers.has('X-MCP-Review')).toBe(false);
    read.flush([]);
    await catalog;
    const review = api.review('command/id', { arguments: {}, expectedFingerprint: 'fingerprint' });
    const write = http.expectOne('/api/admin/mcp/operations/proposals/command%2Fid/review');
    expect(write.request.withCredentials).toBe(true);
    expect(write.request.headers.has('Authorization')).toBe(false);
    expect(write.request.headers.get('X-MCP-Review')).toBe('1');
    write.flush({ token: 'proof' });
    await review;
    const decision = api.decide('command/id', { decision: 'APPROVE', expectedFingerprint: 'fingerprint' });
    const execution = http.expectOne('/api/admin/mcp/operations/proposals/command%2Fid/decision');
    execution.flush({ success: true, state: 'UNCERTAIN' });
    await expect(decision).resolves.toEqual({ success: true, state: 'UNCERTAIN' });
    http.verify();
  });
});
