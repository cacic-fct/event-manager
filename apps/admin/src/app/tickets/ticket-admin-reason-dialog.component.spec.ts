import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TicketAdminReasonDialogComponent, type TicketAdminReasonDialogData } from './ticket-admin-reason-dialog.component';

describe('TicketAdminReasonDialogComponent', () => {
  let fixture: ComponentFixture<TicketAdminReasonDialogComponent>;
  let close: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    close = vi.fn();
    const data: TicketAdminReasonDialogData = {
      title: 'Revogar bilhete',
      actionLabel: 'Revogar bilhete',
      description: 'O bilhete deixará de ser válido. Registre o motivo para auditoria.',
    };
    TestBed.configureTestingModule({
      imports: [TicketAdminReasonDialogComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    fixture = TestBed.createComponent(TicketAdminReasonDialogComponent);
    fixture.detectChanges();
  });

  it('requires a non-blank reason and returns trimmed audit text', () => {
    const submit = [...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) =>
      button.textContent?.includes('Revogar bilhete'),
    ) as HTMLButtonElement;
    const reason = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    expect(submit.disabled).toBe(true);

    reason.value = '   ';
    reason.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(submit.disabled).toBe(true);

    reason.value = '  Pedido de cancelamento confirmado.  ';
    reason.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(submit.disabled).toBe(false);
    submit.click();
    expect(close).toHaveBeenCalledWith('Pedido de cancelamento confirmado.');
  });
});
