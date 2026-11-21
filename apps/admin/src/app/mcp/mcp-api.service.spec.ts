import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { McpApi } from './mcp-api.service';

describe('McpApi session boundary', () => {
  it('bypasses bearer interceptors and includes the review header only on mutations', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([
            (request, next) => next(request.clone({ setHeaders: { Authorization: 'Bearer must-not-send' } })),
          ]),
        ),
        provideHttpClientTesting(),
      ],
    });
    const api = TestBed.inject(McpApi);
    const http = TestBed.inject(HttpTestingController);
    const settings = api.settings();
    const read = http.expectOne('/api/admin/mcp/settings');
    expect(read.request.withCredentials).toBe(true);
    expect(read.request.headers.has('Authorization')).toBe(false);
    expect(read.request.headers.has('X-MCP-Review')).toBe(false);
    read.flush({ enabled: true });
    await settings;
    const input = {
      expectedOperation: 'EVENT_DESCRIPTION' as const,
      expectedUpdatedAt: new Date().toISOString(),
      selections: [{ field: 'description' as const, value: 'Descrição revisada.' }],
    };
    const review = api.prepareReview('proposal/id', input);
    const prepare = http.expectOne('/api/admin/mcp/proposals/proposal%2Fid/review');
    expect(prepare.request.method).toBe('POST');
    expect(prepare.request.withCredentials).toBe(true);
    expect(prepare.request.headers.get('X-MCP-Review')).toBe('1');
    expect(prepare.request.headers.has('Authorization')).toBe(false);
    expect(prepare.request.body).toEqual(input);
    prepare.flush({ token: 'proof', changes: [] });
    await review;
    const decision = api.decide('proposal/id', { decision: 'REJECT', expectedUpdatedAt: new Date().toISOString() });
    const write = http.expectOne('/api/admin/mcp/proposals/proposal%2Fid/decision');
    expect(write.request.method).toBe('POST');
    expect(write.request.withCredentials).toBe(true);
    expect(write.request.headers.get('X-MCP-Review')).toBe('1');
    expect(write.request.headers.has('Authorization')).toBe(false);
    write.flush({ success: true });
    await decision;
    http.verify();
  });
});
