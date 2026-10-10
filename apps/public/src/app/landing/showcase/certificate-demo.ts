import { Component, computed, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TwemojiComponent } from '@cacic-fct/shared-angular';

type CertificateAudience = 'participants' | 'speakers';
type CertificateStep = 'configuration' | 'issued' | 'inspection';

interface DemoCertificate {
  readonly id: string;
  readonly personName: string;
  readonly target: string;
  readonly type: 'Participante' | 'Palestrante';
  readonly context: string;
  readonly action: string;
  readonly hours: number;
}

const CERTIFICATES: Record<CertificateAudience, readonly DemoCertificate[]> = {
  participants: [
    {
      id: 'DEMO-PART-001',
      personName: 'Marina Costa',
      target: 'Semana de Tecnologia',
      type: 'Participante',
      context: 'Participação com duração de 2 horas',
      action: 'participou',
      hours: 2,
    },
    {
      id: 'DEMO-PART-002',
      personName: 'Rafael Almeida',
      target: 'Semana de Tecnologia',
      type: 'Participante',
      context: 'Participação com duração de 2 horas',
      action: 'participou',
      hours: 2,
    },
  ],
  speakers: [
    {
      id: 'DEMO-SPEAKER-001',
      personName: 'Beatriz Lima',
      target: 'Semana de Tecnologia',
      type: 'Palestrante',
      context: 'Palestra com duração de 2 horas',
      action: 'ministrou uma palestra',
      hours: 2,
    },
  ],
};

@Component({
  selector: 'app-landing-certificate-demo',
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule, TwemojiComponent],
  templateUrl: './certificate-demo.html',
  styleUrl: './certificate-demo.scss',
})
export class CertificateDemoComponent {
  readonly audience = signal<CertificateAudience>('participants');
  readonly step = signal<CertificateStep>('configuration');
  readonly publicCertificateName = signal('Interfaces que incluem');
  readonly issuedCertificates = signal<readonly DemoCertificate[]>([]);
  readonly selectedCertificate = signal<DemoCertificate | null>(null);
  readonly statusMessage = signal('');

  readonly eligibleCertificates = computed(() => CERTIFICATES[this.audience()]);
  readonly eligibleSummary = computed(() => {
    const count = this.eligibleCertificates().length;
    const audienceLabel = this.audience() === 'participants'
      ? count === 1 ? 'participante' : 'participantes'
      : count === 1 ? 'palestrante' : 'palestrantes';
    return `${count} ${audienceLabel} ${count === 1 ? 'elegível' : 'elegíveis'}`;
  });
  readonly audienceLabel = computed(() => this.audience() === 'participants' ? 'participantes' : 'palestrantes');
  readonly previewCertificate = computed(() => this.eligibleCertificates()[0]);
  readonly previewText = computed(() => {
    const certificate = this.previewCertificate();
    return certificate ? this.buildCertificateText(certificate) : '';
  });
  readonly selectedCertificateText = computed(() => {
    const certificate = this.selectedCertificate();
    return certificate ? this.buildCertificateText(certificate) : '';
  });
  readonly canIssue = computed(() => this.publicCertificateName().trim().length > 0);

  updatePublicCertificateName(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.publicCertificateName.set(target.value);
    }
  }

  selectAudience(audience: CertificateAudience): void {
    if (audience === this.audience()) {
      return;
    }

    this.audience.set(audience);
    this.resetIssuance();
  }

  simulateIssuance(): void {
    if (!this.canIssue()) {
      return;
    }

    this.issuedCertificates.set([...this.eligibleCertificates()]);
    this.selectedCertificate.set(null);
    this.step.set('issued');
    this.statusMessage.set('Certificados disponíveis');
  }

  inspectCertificate(certificate: DemoCertificate): void {
    if (!this.issuedCertificates().some((issued) => issued.id === certificate.id)) {
      return;
    }

    this.selectedCertificate.set(certificate);
    this.step.set('inspection');
    this.statusMessage.set('');
  }

  returnToIssuedList(): void {
    this.selectedCertificate.set(null);
    this.step.set('issued');
  }

  resetDemo(): void {
    this.resetIssuance();
  }

  private resetIssuance(): void {
    this.issuedCertificates.set([]);
    this.selectedCertificate.set(null);
    this.step.set('configuration');
    this.statusMessage.set('');
  }

  private buildCertificateText(certificate: DemoCertificate): string {
    return `Certificamos que ${certificate.personName} ${certificate.action} na ${certificate.target}, com carga horária de ${certificate.hours} horas.`;
  }
}
