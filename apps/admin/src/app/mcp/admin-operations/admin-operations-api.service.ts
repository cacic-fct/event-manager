import { HttpBackend, HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import type {
  AdminMcpOperationInfo,
  AdminMcpDelegation,
  AdminMcpDelegationInput,
  AdminMcpCommandPage,
  AdminMcpCommandReview,
  AdminMcpCommandPreview,
  AdminMcpCommandDecision,
  AdminMcpCommandDecisionResult,
  McpAdminSettings,
} from '@cacic-fct/event-manager-mcp-contracts';
import { firstValueFrom } from 'rxjs';

@Service()
export class AdminOperationsApi {
  private readonly http = new HttpClient(inject(HttpBackend));
  private readonly base = '/api/admin/mcp/operations';
  private readonly options = { withCredentials: true, headers: { 'X-MCP-Review': '1' } };

  settings(): Promise<McpAdminSettings> {
    return firstValueFrom(this.http.get<McpAdminSettings>('/api/admin/mcp/settings', { withCredentials: true }));
  }
  catalog(): Promise<AdminMcpOperationInfo[]> {
    return firstValueFrom(this.http.get<AdminMcpOperationInfo[]>(`${this.base}/catalog`, { withCredentials: true }));
  }
  delegations(): Promise<AdminMcpDelegation[]> {
    return firstValueFrom(this.http.get<AdminMcpDelegation[]>(`${this.base}/delegations`, { withCredentials: true }));
  }
  create(input: AdminMcpDelegationInput): Promise<AdminMcpDelegation> {
    return firstValueFrom(this.http.post<AdminMcpDelegation>(`${this.base}/delegations`, input, this.options));
  }
  async revoke(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`${this.base}/delegations/${encodeURIComponent(id)}/revoke`, {}, this.options));
  }
  proposals(page: number): Promise<AdminMcpCommandPage> {
    return firstValueFrom(
      this.http.get<AdminMcpCommandPage>(`${this.base}/proposals`, { withCredentials: true, params: { page } }),
    );
  }
  review(id: string, input: AdminMcpCommandReview): Promise<AdminMcpCommandPreview> {
    return firstValueFrom(
      this.http.post<AdminMcpCommandPreview>(
        `${this.base}/proposals/${encodeURIComponent(id)}/review`,
        input,
        this.options,
      ),
    );
  }
  async decide(id: string, input: AdminMcpCommandDecision): Promise<AdminMcpCommandDecisionResult> {
    return firstValueFrom(
      this.http.post<AdminMcpCommandDecisionResult>(
        `${this.base}/proposals/${encodeURIComponent(id)}/decision`,
        input,
        this.options,
      ),
    );
  }
}
