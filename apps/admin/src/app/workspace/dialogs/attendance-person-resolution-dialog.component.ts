import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import {
  EventAttendanceCsvImportAmbiguousValue,
  EventAttendanceCsvImportResolution,
  Person,
} from '@cacic-fct/event-manager-admin-contracts';

export interface AttendancePersonResolutionDialogData {
  title?: string;
  description?: string;
  confirmLabel?: string;
  ambiguousValues: EventAttendanceCsvImportAmbiguousValue[];
}

@Component({
  selector: 'app-attendance-person-resolution-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatIconModule, MatRadioModule],
  template: `
    <h2 mat-dialog-title>{{ data.title ?? 'Escolher pessoa correta' }}</h2>
    <div mat-dialog-content class="dialog-content">
      <p>
        {{
          data.description ??
            'Alguns dados podem identificar mais de uma pessoa. Selecione a pessoa correta antes de continuar.'
        }}
      </p>

      @for (ambiguousValue of data.ambiguousValues; track ambiguousValue.value) {
        <section class="resolution-group">
          <div class="value-heading">
            <span>Dado informado</span>
            <strong>{{ ambiguousValue.value }}</strong>
          </div>

          <mat-radio-group
            [value]="selectedPersonId(ambiguousValue.value)"
            (change)="selectPerson(ambiguousValue.value, $event.value)">
            @for (candidate of ambiguousValue.candidates; track candidate.id) {
              <mat-radio-button [value]="candidate.id">
                <span class="candidate-option">
                  <span class="candidate-name">{{ candidate.name }}</span>
                  <span class="candidate-details">{{ candidateDetails(candidate) }}</span>
                </span>
              </mat-radio-button>
            }
          </mat-radio-group>
        </section>
      }
    </div>
    <div mat-dialog-actions align="end">
      <button mat-button type="button" (click)="close()">Cancelar</button>
      <button mat-flat-button type="button" [disabled]="!canConfirm()" (click)="confirm()">
        <mat-icon>check</mat-icon>
        {{ data.confirmLabel ?? 'Continuar' }}
      </button>
    </div>
  `,
  styles: `
    .dialog-content {
      display: grid;
      gap: 1rem;
      max-width: 42rem;
    }

    .dialog-content p {
      color: var(--mat-sys-on-surface-variant);
      margin: 0;
    }

    .resolution-group {
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
      display: grid;
      gap: 0.75rem;
      padding: 0.875rem;
    }

    .value-heading {
      align-items: baseline;
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem 0.5rem;
    }

    .value-heading span,
    .candidate-details {
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.875rem;
    }

    mat-radio-group {
      display: grid;
      gap: 0.5rem;
    }

    mat-radio-button {
      min-width: 0;
    }

    .candidate-option {
      display: grid;
      gap: 0.125rem;
      min-width: 0;
      padding: 0.375rem 0;
    }

    .candidate-name,
    .candidate-details {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .candidate-name {
      font-weight: 500;
    }
  `,
})
export class AttendancePersonResolutionDialogComponent {
  private readonly dialogRef = inject(
    MatDialogRef<AttendancePersonResolutionDialogComponent, EventAttendanceCsvImportResolution[] | null>,
  );
  readonly data = inject<AttendancePersonResolutionDialogData>(MAT_DIALOG_DATA);
  private readonly selectedPersonIds = signal<Record<string, string>>({});

  readonly canConfirm = computed(() =>
    this.data.ambiguousValues.every((ambiguousValue) => Boolean(this.selectedPersonIds()[ambiguousValue.value])),
  );

  selectedPersonId(value: string): string | null {
    return this.selectedPersonIds()[value] ?? null;
  }

  selectPerson(value: string, personId: string): void {
    this.selectedPersonIds.update((selectedPersonIds) => ({
      ...selectedPersonIds,
      [value]: personId,
    }));
  }

  candidateDetails(person: Person): string {
    return [
      person.email ? `E-mail: ${person.email}` : null,
      person.phone ? `Telefone: ${person.phone}` : null,
      person.identityDocument ? `Documento: ${person.identityDocument}` : null,
      person.academicId ? `Matrícula: ${person.academicId}` : null,
    ]
      .filter((detail): detail is string => Boolean(detail))
      .join(' · ') || 'Sem dados complementares';
  }

  close(): void {
    this.dialogRef.close(null);
  }

  confirm(): void {
    if (!this.canConfirm()) {
      return;
    }

    const selectedPersonIds = this.selectedPersonIds();
    this.dialogRef.close(
      this.data.ambiguousValues.map((ambiguousValue) => ({
        value: ambiguousValue.value,
        personId: selectedPersonIds[ambiguousValue.value],
      })),
    );
  }
}
