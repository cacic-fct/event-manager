import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { Permission } from '@cacic-fct/shared-permissions';
import type { AdminTicketEligibility } from '@cacic-fct/shared-ticketing';
import { createAdminPerson } from '../testing/admin-entity-fixtures';
import { PeopleApiService } from '../graphql/people-api.service';
import { TicketAdminApiService } from '../graphql/ticket-admin-api.service';
import { PermissionsService } from '../permissions/permissions.service';
import { TicketAdminPersonActionDialogComponent, type TicketAdminPersonActionData } from './ticket-admin-person-action-dialog.component';

const person = createAdminPerson({ id: 'person-1', name: 'Marina da Silva', email: 'marina@example.edu' });
const ineligible: AdminTicketEligibility = {
  eligible: false,
  warnings: [{ code: 'COURSE_REQUIRED', message: 'É necessário estar matriculado em Ciência da Computação.' }],
};
const eligible: AdminTicketEligibility = { eligible: true, warnings: [] };

function setup(action: 'ISSUE' | 'TRANSFER', eligibility: AdminTicketEligibility, canSearch = true) {
  const issueTicket = vi.fn().mockReturnValue(of({}));
  const startTransfer = vi.fn().mockReturnValue(of({}));
  const getEligibilityWarnings = vi.fn().mockReturnValue(of(eligibility));
  const close = vi.fn();
  const listRelatedPeople = vi.fn(() => of([person]));
  const api = { issueTicket, startTransfer, getEligibilityWarnings };
  const data: TicketAdminPersonActionData = {
    action,
    eventId: 'event-1',
    eventName: 'Jantar de integração',
    ticketName: 'Acesso ao jantar',
    ticketId: action === 'TRANSFER' ? 'ticket-1' : undefined,
    holderName: 'Marina da Silva',
  };
  TestBed.configureTestingModule({
    imports: [TicketAdminPersonActionDialogComponent],
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: { close } },
      { provide: PeopleApiService, useValue: { listRelatedPeople } },
      { provide: TicketAdminApiService, useValue: api },
      { provide: PermissionsService, useValue: { has: (permission: string) => canSearch && permission === Permission.RelatedPerson.Read } },
    ],
  });
  const fixture = TestBed.createComponent(TicketAdminPersonActionDialogComponent);
  return { fixture, api, close, listRelatedPeople };
}

async function settle(fixture: ComponentFixture<TicketAdminPersonActionDialogComponent>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

function button(fixture: ComponentFixture<TicketAdminPersonActionDialogComponent>, label: string): HTMLButtonElement | null {
  return [...fixture.nativeElement.querySelectorAll('button')].find((candidate: HTMLButtonElement) =>
    candidate.getAttribute('aria-label') === label || candidate.textContent?.replace(/\s+/g, ' ').trim().includes(label),
  ) ?? null;
}

async function selectMarina(fixture: ComponentFixture<TicketAdminPersonActionDialogComponent>): Promise<void> {
  const search = fixture.nativeElement.querySelector('app-person-search input') as HTMLInputElement;
  search.value = 'Marina';
  search.dispatchEvent(new Event('input'));
  await settle(fixture);
  button(fixture, 'Buscar')?.click();
  await settle(fixture);
  button(fixture, 'Selecionar Marina da Silva')?.click();
  await settle(fixture);
}

describe('TicketAdminPersonActionDialogComponent', () => {
  it('allows manual issue despite eligibility warnings and records the audit reason', async () => {
    const { fixture, api, close, listRelatedPeople } = setup('ISSUE', ineligible);
    await settle(fixture);
    await selectMarina(fixture);

    expect(listRelatedPeople).toHaveBeenCalledWith({ query: 'Marina', eventId: 'event-1', take: 10 });
    expect(api.getEligibilityWarnings).toHaveBeenCalledWith('event-1', person.id);
    expect(fixture.nativeElement.textContent).toContain('A pessoa não atende a todos os critérios');
    expect(fixture.nativeElement.textContent).toContain('A administração pode continuar com a emissão.');
    expect(button(fixture, 'Emitir bilhete')?.disabled).toBe(true);

    const reason = fixture.nativeElement.querySelector('.reason-field textarea') as HTMLTextAreaElement;
    reason.value = '  Inclusão autorizada pela coordenação.  ';
    reason.dispatchEvent(new Event('input'));
    await settle(fixture);
    button(fixture, 'Emitir bilhete')?.click();
    await vi.waitFor(() => expect(api.issueTicket).toHaveBeenCalledOnce());

    expect(api.issueTicket).toHaveBeenCalledWith({
      eventId: 'event-1',
      personId: person.id,
      reason: 'Inclusão autorizada pela coordenação.',
    });
    expect(close).toHaveBeenCalledWith(true);
  });

  it('blocks ineligible transfers despite an audit reason', async () => {
    const blocked = setup('TRANSFER', ineligible);
    await settle(blocked.fixture);
    await selectMarina(blocked.fixture);
    const reason = blocked.fixture.nativeElement.querySelector('.reason-field textarea') as HTMLTextAreaElement;
    reason.value = 'Transferência solicitada.';
    reason.dispatchEvent(new Event('input'));
    await settle(blocked.fixture);
    expect(button(blocked.fixture, 'Enviar para confirmação')?.disabled).toBe(true);
    expect(blocked.api.startTransfer).not.toHaveBeenCalled();
  });

  it('sends the ticket ID and trimmed reason for eligible transfers', async () => {
    const allowed = setup('TRANSFER', eligible);
    await settle(allowed.fixture);
    await selectMarina(allowed.fixture);
    const allowedReason = allowed.fixture.nativeElement.querySelector('.reason-field textarea') as HTMLTextAreaElement;
    allowedReason.value = '  Ajuste administrativo.  ';
    allowedReason.dispatchEvent(new Event('input'));
    await settle(allowed.fixture);
    button(allowed.fixture, 'Enviar para confirmação')?.click();
    await vi.waitFor(() => expect(allowed.api.startTransfer).toHaveBeenCalledOnce());

    expect(allowed.api.startTransfer).toHaveBeenCalledWith({
      ticketId: 'ticket-1',
      recipientPersonId: person.id,
      reason: 'Ajuste administrativo.',
    });
    expect(allowed.close).toHaveBeenCalledWith(true);
  });

  it('keeps search disabled without related-person-read permission', async () => {
    const { fixture, api } = setup('ISSUE', eligible, false);
    await settle(fixture);
    const search = fixture.nativeElement.querySelector('app-person-search input') as HTMLInputElement;
    expect(search.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Buscar pessoas exige a permissão de leitura de pessoas relacionadas ao evento.');
    expect(api.getEligibilityWarnings).not.toHaveBeenCalled();
  });
});
