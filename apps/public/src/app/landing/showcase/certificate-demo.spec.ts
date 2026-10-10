import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CertificateDemoComponent } from './certificate-demo';

describe('CertificateDemoComponent', () => {
  let fixture: ComponentFixture<CertificateDemoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CertificateDemoComponent] }).compileComponents();

    fixture = TestBed.createComponent(CertificateDemoComponent);
    fixture.detectChanges();
  });

  it('clears the prior issuance when switching audience and emits only the new eligible list', () => {
    const component = fixture.componentInstance;
    component.simulateIssuance();
    const firstParticipantCertificate = component.issuedCertificates()[0];
    expect(firstParticipantCertificate).toBeDefined();
    if (!firstParticipantCertificate) {
      throw new Error('Expected the participant issuance to include a certificate.');
    }
    component.inspectCertificate(firstParticipantCertificate);

    component.selectAudience('speakers');
    fixture.detectChanges();

    expect(component.step()).toBe('configuration');
    expect(component.issuedCertificates()).toEqual([]);
    expect(component.selectedCertificate()).toBeNull();
    expect(component.eligibleCertificates().map((certificate) => certificate.personName)).toEqual(['Beatriz Lima']);

    component.simulateIssuance();
    fixture.detectChanges();

    expect(component.issuedCertificates().map((certificate) => certificate.personName)).toEqual(['Beatriz Lima']);
    expect(component.statusMessage()).toBe('Certificados disponíveis');
  });

  it('opens public validation details in the panel and supports back and local reset', () => {
    const component = fixture.componentInstance;
    component.simulateIssuance();
    const firstCertificate = component.issuedCertificates()[0];
    expect(firstCertificate).toBeDefined();
    if (!firstCertificate) {
      throw new Error('Expected the participant issuance to include a certificate.');
    }
    component.inspectCertificate(firstCertificate);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Marina Costa');
    expect(element.textContent).toContain('Semana de Tecnologia');
    expect(element.textContent).toContain('DEMO-PART-001');
    expect(element.textContent).toContain('Participante');
    expect(element.textContent).toContain('Certificamos que Marina Costa participou');

    component.returnToIssuedList();
    fixture.detectChanges();
    expect(component.step()).toBe('issued');
    expect(element.textContent).toContain('Visualizar');

    component.resetDemo();
    fixture.detectChanges();
    expect(component.step()).toBe('configuration');
    expect(component.issuedCertificates()).toEqual([]);
    expect(component.selectedCertificate()).toBeNull();
  });

  it('requires a public certificate name before simulating issuance', () => {
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = ' ';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fixture.componentInstance.simulateIssuance();
    expect(fixture.componentInstance.step()).toBe('configuration');
  });

  it('moves keyboard focus to the new heading after each step replaces its controls', async () => {
    const element = fixture.nativeElement as HTMLElement;
    expect(element.ownerDocument.activeElement).not.toBe(element.querySelector('h3'));

    for (const [label, heading] of [
      ['Emitir certificados pendentes', 'Certificados emitidos'],
      ['Visualizar', 'Dados de validação'],
      ['Voltar à lista', 'Certificados emitidos'],
      ['Nova emissão', 'Configurar certificado'],
    ]) {
      const button = [...element.querySelectorAll('button')].find((candidate) => candidate.textContent?.includes(label));
      if (!button) throw new Error(`Certificate button not found: ${label}`);
      button.focus();
      button.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(element.ownerDocument.activeElement).toBe(element.querySelector('h3'));
      expect(element.ownerDocument.activeElement?.textContent).toBe(heading);
    }
  });
});
