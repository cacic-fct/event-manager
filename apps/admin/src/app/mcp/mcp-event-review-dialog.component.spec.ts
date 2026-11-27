import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { McpAdminProposal } from '@cacic-fct/event-manager-mcp-contracts';
import { McpApi } from './mcp-api.service';
import { McpEventReviewDialogComponent } from './mcp-event-review-dialog.component';

function setup() {
  const now = new Date().toISOString();
  const proposal: McpAdminProposal = {
    id: 'proposal',
    delegationId: 'access',
    eventId: 'event',
    eventName: 'Oficina',
    clientId: 'client',
    operation: 'EVENT_CONTENT',
    createdAt: now,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    status: 'PENDING',
    descriptionBefore: 'Antes',
    descriptionAfter: 'Original',
    reviewFields: [
      { field: 'name', label: 'Nome', proposedValue: 'Oficina prática' },
      { field: 'description', label: 'Descrição', proposedValue: 'Original' },
    ],
    baseUpdatedAt: now,
    currentUpdatedAt: now,
    currentDescription: 'Antes',
    publicationState: 'Rascunho',
    approvalEffects: 'Atualiza o evento.',
    canApprove: true,
    unavailableReason: null,
    approvedByName: null,
    decidedAt: null,
  };
  const api = {
    prepareReview: vi.fn().mockResolvedValue({
      token: 'signed-preview',
      approvalEffects: proposal.approvalEffects,
      changes: [{ field: 'description', label: 'Descrição', before: 'Antes', after: 'Editado' }],
    }),
    decide: vi.fn().mockResolvedValue(undefined),
  };
  const dialog = { disableClose: false, close: vi.fn() };
  TestBed.configureTestingModule({
    imports: [McpEventReviewDialogComponent],
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: proposal },
      { provide: MatDialogRef, useValue: dialog },
      { provide: McpApi, useValue: api },
    ],
  });
  const fixture = TestBed.createComponent(McpEventReviewDialogComponent);
  fixture.detectChanges();
  return { component: fixture.componentInstance, proposal, api, dialog };
}

describe('McpEventReviewDialogComponent', () => {
  it('approves the confirmed snapshot even if the editable values change before the decision', async () => {
    const { component, proposal, api, dialog } = setup();
    component.select('name', false);
    component.changeValue('description', '  Editado  ');
    await component.approve();
    expect(api.decide).not.toHaveBeenCalled();

    await component.prepare();
    const revision = { expectedOperation: 'EVENT_CONTENT', expectedUpdatedAt: proposal.baseUpdatedAt };
    const selections = [{ field: 'description', value: 'Editado' }];
    expect(api.prepareReview).toHaveBeenCalledWith(proposal.id, { ...revision, selections });
    expect(component.preview()?.changes[0].after).toBe('Editado');
    component.changeValue('description', 'Outra versão');
    await component.approve();
    await component.approve();

    expect(api.decide).toHaveBeenCalledExactlyOnceWith(proposal.id, {
      ...revision,
      decision: 'APPROVE',
      review: { token: 'signed-preview', selections },
    });
    expect(dialog.close).toHaveBeenCalledExactlyOnceWith(true);
    expect(dialog.disableClose).toBe(true);
  });

  it('keeps the draft on a validation error and clears the confirmation when returning to the editor', async () => {
    const { component, api, dialog } = setup();
    component.select('name', false);
    component.select('description', false);
    await component.prepare();
    expect(api.prepareReview).not.toHaveBeenCalled();

    component.select('description', true);
    component.changeValue('description', 'Editado');
    api.prepareReview.mockRejectedValueOnce(new Error('Validação do evento falhou.'));
    await component.prepare();
    expect(component.error()).toBe('Validação do evento falhou.');
    expect(component.fields()[1].input).toBe('Editado');
    expect(dialog.disableClose).toBe(false);

    await component.prepare();
    api.decide.mockRejectedValueOnce(new Error('A confirmação expirou.'));
    await component.approve();
    expect(component.error()).toBe('A confirmação expirou.');
    expect(component.preview()?.token).toBe('signed-preview');
    expect(dialog.close).not.toHaveBeenCalled();
    expect(dialog.disableClose).toBe(false);
    component.back();
    expect(component.preview()).toBeNull();
    expect(component.fields()[1].input).toBe('Editado');
  });
});
