import { ComponentFixture, TestBed } from '@angular/core/testing';
import { registerLocaleData } from '@angular/common';
import pt from '@angular/common/locales/pt';
import { ParticipationHistoryDemoComponent } from './participation-history-demo';

describe('ParticipationHistoryDemoComponent', () => {
  let fixture: ComponentFixture<ParticipationHistoryDemoComponent>;
  let component: ParticipationHistoryDemoComponent;

  afterEach(() => vi.useRealTimers());

  beforeEach(async () => {
    registerLocaleData(pt, 'pt-BR');
    await TestBed.configureTestingModule({ imports: [ParticipationHistoryDemoComponent] }).compileComponents();

    fixture = TestBed.createComponent(ParticipationHistoryDemoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('opens the requested participation and lets the visitor select another history row', () => {
    fixture.componentRef.setInput('initialParticipation', 'innovation');
    fixture.detectChanges();

    expect(component.selectedParticipation()?.title).toBe('Jornada de Inovação');
    expect(fixture.nativeElement.textContent).toContain('Inscrição confirmada');
    expect(fixture.nativeElement.textContent).toContain('Presença registrada');

    component.openParticipation('technology');
    fixture.detectChanges();

    expect(component.selectedParticipation()?.title).toBe('Semana de Tecnologia');
    expect(fixture.nativeElement.textContent).toContain('Interfaces que incluem');
    expect(fixture.nativeElement.textContent).toContain('Realidade Virtual');

    component.openParticipation('unknown');
    expect(component.selectedParticipation()?.title).toBe('Semana de Tecnologia');
  });

  it('simulates one certificate separately and prepares the full collection as a batch', async () => {
    vi.useFakeTimers();
    const allIds = component.certificates().map((certificate) => certificate.id);
    const firstId = allIds[0];
    const secondId = allIds[1];
    expect(firstId).toBeDefined();
    expect(secondId).toBeDefined();
    if (!firstId || !secondId) {
      throw new Error('Expected issued certificates in the curated history.');
    }

    component.downloadCertificate(firstId);
    expect(component.downloadingCertificateId()).toBe(firstId);
    component.downloadAllCertificates();
    expect(component.isDownloadingAllCertificates()).toBe(false);
    await vi.advanceTimersByTimeAsync(350);

    expect(component.downloadedCertificateIds()).toEqual([firstId]);
    expect(component.downloadStatus()).toBe('Certificado baixado');

    component.downloadAllCertificates();
    expect(component.isDownloadingAllCertificates()).toBe(true);
    component.downloadCertificate(secondId);
    expect(component.downloadingCertificateId()).toBeNull();
    await vi.advanceTimersByTimeAsync(450);

    expect(component.isDownloadingAllCertificates()).toBe(false);
    expect(component.downloadedCertificateIds()).toEqual(allIds);
    expect(component.downloadStatus()).toBe('Certificados preparados');
    vi.useRealTimers();
  });

  it('ignores unknown certificate ids and leaves history state unchanged', () => {
    component.openParticipation('technology');
    component.downloadCertificate('missing-certificate');

    expect(component.selectedParticipation()?.id).toBe('technology');
    expect(component.downloadingCertificateId()).toBeNull();
    expect(component.downloadStatus()).toBe('');
  });
});
