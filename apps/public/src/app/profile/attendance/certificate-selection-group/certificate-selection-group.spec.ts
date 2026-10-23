import { TestBed } from '@angular/core/testing';
import { CertificateSelectionGroup } from './certificate-selection-group';

describe('CertificateSelectionGroup', () => {
  it('represents partial selection and emits all child ids when the parent is checked', async () => {
    const fixture = TestBed.createComponent(CertificateSelectionGroup);
    fixture.componentRef.setInput('title', 'Evento');
    fixture.componentRef.setInput('certificates', [
      { id: 'one', config: { name: 'Participação' }, issuedAt: new Date().toISOString() },
      { id: 'two', config: { name: 'Ministrante' }, issuedAt: new Date().toISOString() },
    ]);
    fixture.componentRef.setInput('selectedIds', new Set(['one']));
    fixture.detectChanges();
    const inputs = fixture.nativeElement.querySelectorAll('input') as NodeListOf<HTMLInputElement>;
    expect(inputs[0].indeterminate).toBe(true);
    expect(inputs[1].checked).toBe(true);
    expect(inputs[2].checked).toBe(false);
    const changed = vi.fn();
    fixture.componentInstance.selectionChange.subscribe(changed);
    inputs[0].click();
    expect(changed).toHaveBeenCalledWith({ ids: ['one', 'two'], selected: true });
  });

  it('disables participation selection when no certificates have been issued', () => {
    const fixture = TestBed.createComponent(CertificateSelectionGroup);
    fixture.componentRef.setInput('title', 'Evento');
    fixture.componentRef.setInput('certificates', []);
    fixture.componentRef.setInput('selectedIds', new Set());
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input').disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Nenhum certificado emitido');
  });
});
