import { DatePipe } from '@angular/common';
import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TwemojiComponent } from '@cacic-fct/shared-angular';
import { getSubscriptionStatusLabel } from '@cacic-fct/shared-utils';

type ParticipationId = 'technology' | 'innovation';

interface ParticipationActivity {
  id: string;
  name: string;
  emoji: string;
  attendedAt: Date;
  status: 'Presença registrada';
  certificateIssued: boolean;
}

interface IssuedCertificate {
  id: string;
  activityName: string;
  issuedAt: Date;
}

interface ParticipationHistoryItem {
  id: ParticipationId;
  title: string;
  emoji: string;
  date: Date;
  registrationStatus: string;
  activities: readonly ParticipationActivity[];
  certificates: readonly IssuedCertificate[];
}

function daysAgo(referenceDate: Date, days: number, hour = 12): Date {
  const date = new Date(referenceDate);
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function createParticipationHistory(referenceDate: Date): readonly ParticipationHistoryItem[] {
  const technologyDate = daysAgo(referenceDate, 112);
  const innovationDate = daysAgo(referenceDate, 46);

  return [
    {
      id: 'technology',
      title: 'Semana de Tecnologia',
      emoji: '💻',
      date: technologyDate,
      registrationStatus: getSubscriptionStatusLabel('CONFIRMED'),
      activities: [
        {
          id: 'interfaces',
          name: 'Interfaces que incluem',
          emoji: '♿',
          attendedAt: technologyDate,
          status: 'Presença registrada',
          certificateIssued: true,
        },
        {
          id: 'creating-with-ai',
          name: 'Realidade Virtual',
          emoji: '🥽',
          attendedAt: daysAgo(referenceDate, 112, 16),
          status: 'Presença registrada',
          certificateIssued: true,
        },
      ],
      certificates: [
        { id: 'technology-interfaces', activityName: 'Interfaces que incluem', issuedAt: daysAgo(referenceDate, 110) },
        { id: 'technology-ai', activityName: 'Realidade Virtual', issuedAt: daysAgo(referenceDate, 110) },
      ],
    },
    {
      id: 'innovation',
      title: 'Jornada de Inovação',
      emoji: '💡',
      date: innovationDate,
      registrationStatus: getSubscriptionStatusLabel('CONFIRMED'),
      activities: [
        {
          id: 'collaborative-ideas',
          name: 'Ideação colaborativa',
          emoji: '💡',
          attendedAt: innovationDate,
          status: 'Presença registrada',
          certificateIssued: true,
        },
        {
          id: 'rapid-prototype',
          name: 'Prototipagem rápida',
          emoji: '🚀',
          attendedAt: daysAgo(referenceDate, 46, 16),
          status: 'Presença registrada',
          certificateIssued: false,
        },
      ],
      certificates: [
        { id: 'innovation-ideas', activityName: 'Ideação colaborativa', issuedAt: daysAgo(referenceDate, 44) },
      ],
    },
  ];
}

@Component({
  selector: 'app-landing-participation-history-demo',
  imports: [DatePipe, MatButtonModule, MatIconModule, TwemojiComponent],
  templateUrl: './participation-history-demo.html',
  styleUrl: './participation-history-demo.scss',
})
export class ParticipationHistoryDemoComponent {
  readonly initialParticipation = input<string | null>(null);
  private readonly referenceDate = new Date();
  readonly participations = createParticipationHistory(this.referenceDate);
  readonly selectedId = linkedSignal(() => this.initialParticipation());
  readonly selectedParticipation = computed(
    () => this.participations.find((participation) => participation.id === this.selectedId()) ?? null,
  );
  readonly certificates = computed(() => this.participations.flatMap((participation) => participation.certificates));
  readonly downloadingCertificateId = signal<string | null>(null);
  readonly isDownloadingAllCertificates = signal(false);
  readonly downloadedCertificateIds = signal<string[]>([]);
  readonly downloadStatus = signal('');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private downloadTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearDownloadTimer());
  }

  openParticipation(id: string): void {
    if (this.participations.some((participation) => participation.id === id)) {
      this.selectedId.set(id);
      this.focusAfterRender('#history-demo-detail-title');
    }
  }

  returnToHistory(): void {
    this.selectedId.set(null);
    this.focusAfterRender('#history-demo-list-title');
  }

  downloadCertificate(certificateId: string): void {
    const certificateExists = this.certificates().some((certificate) => certificate.id === certificateId);
    if (!certificateExists || this.downloadingCertificateId() || this.isDownloadingAllCertificates()) {
      return;
    }

    this.downloadStatus.set('Preparando o certificado.');
    this.downloadingCertificateId.set(certificateId);
    this.downloadTimer = setTimeout(() => {
      this.downloadedCertificateIds.update((ids) => (ids.includes(certificateId) ? ids : [...ids, certificateId]));
      this.downloadingCertificateId.set(null);
      this.downloadStatus.set('Certificado baixado');
      this.downloadTimer = null;
    }, 350);
  }

  downloadAllCertificates(): void {
    if (this.certificates().length === 0 || this.downloadingCertificateId() || this.isDownloadingAllCertificates()) {
      return;
    }

    this.downloadStatus.set('Preparando todos os certificados.');
    this.isDownloadingAllCertificates.set(true);
    this.downloadTimer = setTimeout(() => {
      this.downloadedCertificateIds.set(this.certificates().map((certificate) => certificate.id));
      this.isDownloadingAllCertificates.set(false);
      this.downloadStatus.set('Certificados preparados');
      this.downloadTimer = null;
    }, 450);
  }

  certificateButtonLabel(certificate: IssuedCertificate): string {
    if (this.downloadingCertificateId() === certificate.id) {
      return 'Preparando certificado';
    }

    return this.downloadedCertificateIds().includes(certificate.id) ? 'Certificado baixado' : 'Baixar certificado';
  }

  private clearDownloadTimer(): void {
    if (this.downloadTimer !== null) {
      clearTimeout(this.downloadTimer);
      this.downloadTimer = null;
    }
  }

  private focusAfterRender(selector: string): void {
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true }),
      { injector: this.injector },
    );
  }
}
