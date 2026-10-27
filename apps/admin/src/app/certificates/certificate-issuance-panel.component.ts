import { DatePipe } from '@angular/common';
import { Component, type ElementRef, computed, input, output, signal, viewChild } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type { CertificateIssuanceInput, CertificateIssuanceRun } from '@cacic-fct/event-manager-admin-contracts';

export type CertificateIssuanceRequest = Omit<CertificateIssuanceInput, 'configId'>;

@Component({
  selector: 'app-certificate-issuance-panel',
  imports: [
    DatePipe,
    FormField,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './certificate-issuance-panel.component.html',
  styleUrls: [
    '../app-shell/layout/forms-feedback.shared.scss',
    '../app-shell/layout/page-layout.shared.scss',
    './certificate-issuance-panel.component.scss',
  ],
})
export class CertificateIssuancePanelComponent {
  readonly runs = input<CertificateIssuanceRun[]>([]);
  readonly busy = input(false);
  readonly enabled = input(true);
  readonly saved = input(false);
  readonly manual = input(false);
  readonly canIssue = input(false);
  readonly canReissue = input(false);
  readonly loadError = input<string | null>(null);
  readonly issuanceRequested = output<CertificateIssuanceRequest>();
  readonly cancelRequested = output<string>();
  readonly refreshRequested = output<void>();
  readonly activeRun = computed(() =>
    this.runs().find((run) => run.status === 'PENDING' || run.status === 'PROCESSING'),
  );
  readonly latestRun = computed(() => this.runs().find((run) => !['PENDING', 'PROCESSING'].includes(run.status)));
  protected readonly model = signal({ timing: 'NOW', scheduledAt: '', notifyRecipients: true });
  protected readonly issuanceForm = form(this.model);
  private readonly scheduleInput = viewChild<ElementRef<HTMLInputElement>>('scheduleInput');
  protected readonly error = signal<string | null>(null);

  protected request(reissue: boolean): void {
    const value = this.model();
    const scheduledAt = value.timing === 'SCHEDULE' ? new Date(value.scheduledAt) : null;
    if (scheduledAt && (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now())) {
      this.error.set('Escolha uma data e hora futuras para agendar a emissão.');
      this.scheduleInput()?.nativeElement.focus();
      return;
    }
    this.error.set(null);
    this.issuanceRequested.emit({
      scheduledAt: scheduledAt?.toISOString(),
      reissue,
      notifyRecipients: value.notifyRecipients,
    });
  }

  protected statusLabel(run: CertificateIssuanceRun): string {
    return {
      PENDING: 'Na fila.',
      PROCESSING: 'Em andamento.',
      COMPLETED: 'Emissão concluída.',
      FAILED: 'Falha na emissão.',
      CANCELLED: 'Emissão cancelada.',
    }[run.status];
  }
}
