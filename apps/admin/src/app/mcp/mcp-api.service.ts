import { HttpBackend, HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import type {
  McpAdminDelegation,
  McpAdminProposalPage,
  McpAdminSettings,
  McpDelegationInput,
  McpEventReviewInput,
  McpEventReviewPreview,
  McpProposalDecisionInput,
} from '@cacic-fct/event-manager-mcp-contracts';
import { firstValueFrom } from 'rxjs';

@Service()
export class McpApi {
  // Review requests use the browser session and must never acquire an OAuth bearer token.
  private readonly http = new HttpClient(inject(HttpBackend));
  private readonly base = '/api/admin/mcp';
  private readonly mutationOptions = { withCredentials: true, headers: { 'X-MCP-Review': '1' } };

  settings(): Promise<McpAdminSettings> {
    return firstValueFrom(this.http.get<McpAdminSettings>(`${this.base}/settings`, { withCredentials: true }));
  }

  delegations(): Promise<McpAdminDelegation[]> {
    return firstValueFrom(this.http.get<McpAdminDelegation[]>(`${this.base}/delegations`, { withCredentials: true }));
  }

  create(input: McpDelegationInput): Promise<McpAdminDelegation> {
    return firstValueFrom(this.http.post<McpAdminDelegation>(`${this.base}/delegations`, input, this.mutationOptions));
  }

  async revoke(id: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.base}/delegations/${encodeURIComponent(id)}/revoke`, {}, this.mutationOptions),
    );
  }

  proposals(page: number, id: string | null): Promise<McpAdminProposalPage> {
    return firstValueFrom(
      this.http.get<McpAdminProposalPage>(`${this.base}/proposals`, {
        withCredentials: true,
        params: { page, ...(id ? { id } : {}) },
      }),
    );
  }

  prepareReview(id: string, input: McpEventReviewInput): Promise<McpEventReviewPreview> {
    return firstValueFrom(
      this.http.post<McpEventReviewPreview>(
        `${this.base}/proposals/${encodeURIComponent(id)}/review`,
        input,
        this.mutationOptions,
      ),
    );
  }

  async decide(id: string, input: McpProposalDecisionInput): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.base}/proposals/${encodeURIComponent(id)}/decision`, input, this.mutationOptions),
    );
  }
}

export function mcpErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const body: unknown = error.error;
    if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') return body.message;
    return fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
