import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';
import type { OfflineEventAttendanceSubmission, Person } from '@cacic-fct/event-manager-admin-contracts';
import { PeopleApiService } from '../../../graphql/people-api.service';
import { buildPeopleCandidateLookupFilters, parseUserAztecIdentifier } from '../../../people/people-lookup';

export interface OfflineAttendanceSubmissionEditDialogData {
  submission: OfflineEventAttendanceSubmission & {
    eventName: string;
    personName: string;
  };
  issueLabel: string;
}

export interface OfflineAttendanceSubmissionEditDialogResult {
  personId: string;
}

@Component({
  selector: 'app-workspace-offline-attendance-submission-edit-dialog',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title>Corrigir presença off-line</h2>
    <div mat-dialog-content class="offline-correction-content">
      <div class="correction-summary">
        <span>{{ data.submission.eventName }}</span>
        <strong>{{ data.issueLabel }}</strong>
        <span>Coletada em {{ data.submission.collectedAt | date: 'short' }}</span>
      </div>

      <section class="original-data" aria-label="Dado original">
        <div class="section-title">
          <mat-icon>{{ originalSourceIcon() }}</mat-icon>
          <span>Dado original</span>
        </div>
        <dl class="original-grid">
          <div>
            <dt>Origem</dt>
            <dd>{{ originalSourceLabel() }}</dd>
          </div>
          <div>
            <dt>Valor recebido</dt>
            <dd>{{ originalValue() || 'Não informado' }}</dd>
          </div>
        </dl>
      </section>

      <form class="correction-form">
        <div class="person-lookup">
          <mat-form-field>
            <mat-label>Buscar pessoa</mat-label>
            <input
              matInput
              [formControl]="personSearch"
              autocomplete="off"
              (keydown.enter)="searchPeople(); $event.preventDefault()" />
            <button mat-icon-button matSuffix type="button" aria-label="Executar busca de pessoa" (click)="searchPeople()">
              @if (isSearching()) {
                <mat-spinner diameter="18"></mat-spinner>
              } @else {
                <mat-icon>search</mat-icon>
              }
            </button>
            <mat-hint>{{ inferredSearchLabel() }}</mat-hint>
          </mat-form-field>

          @if (selectedPerson()) {
            <div class="selected-person">
              <mat-icon>person_check</mat-icon>
              <span>
                <strong>{{ selectedPerson()?.name }}</strong>
                {{ selectedPersonDetail() }}
              </span>
              <button mat-button type="button" (click)="clearSelectedPerson()">Remover vínculo</button>
            </div>
          }

          @if (candidatePeople().length > 0) {
            <mat-nav-list class="candidate-list" aria-label="Pessoas encontradas">
              @for (person of candidatePeople(); track person.id) {
                <button mat-list-item type="button" (click)="selectPerson(person)">
                  <mat-icon matListItemIcon>person</mat-icon>
                  <span matListItemTitle>{{ person.name }}</span>
                  <span matListItemLine>{{ personSummary(person) }}</span>
                </button>
              }
            </mat-nav-list>
          }
        </div>
      </form>

      @if (data.submission.resolutionError) {
        <p class="correction-note">{{ data.submission.resolutionError }}</p>
      }
      @if (errorMessage()) {
        <p class="error-message">{{ errorMessage() }}</p>
      }
    </div>
    <div mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancelar</button>
      <button mat-flat-button type="button" [disabled]="isSaving()" (click)="save()">
        @if (isSaving()) {
          <mat-spinner diameter="16"></mat-spinner>
        } @else {
          Salvar correção
        }
      </button>
    </div>
  `,
  styles: `
    .offline-correction-content {
      display: grid;
      gap: 1rem;
      min-width: min(36rem, 100%);
    }

    .correction-summary,
    .original-data,
    .selected-person,
    .correction-note,
    .error-message {
      border-radius: 8px;
      overflow-wrap: anywhere;
    }

    .correction-summary {
      border: 1px solid var(--mat-sys-outline-variant);
      display: grid;
      gap: 0.2rem;
      padding: 0.75rem;
    }

    .original-data {
      background: var(--mat-sys-surface-container-low);
      border: 1px solid var(--mat-sys-outline-variant);
      display: grid;
      gap: 0.75rem;
      padding: 0.75rem;
    }

    .section-title {
      align-items: center;
      color: var(--mat-sys-on-surface);
      display: flex;
      font-weight: 600;
      gap: 0.5rem;
    }

    .section-title mat-icon {
      color: var(--mat-sys-primary);
    }

    .original-grid {
      display: grid;
      gap: 0.75rem;
      grid-template-columns: minmax(8rem, 0.45fr) minmax(0, 1fr);
      margin: 0;
    }

    .original-grid div {
      min-width: 0;
    }

    .original-grid dt {
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.78rem;
      margin-bottom: 0.2rem;
    }

    .original-grid dd {
      margin: 0;
    }

    .correction-summary span {
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.85rem;
    }

    .correction-form {
      display: grid;
      gap: 0.75rem;
    }

    .person-lookup {
      display: grid;
      gap: 0.5rem;
    }

    .selected-person {
      align-items: center;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
      display: grid;
      gap: 0.5rem;
      grid-template-columns: auto minmax(0, 1fr) auto;
      padding: 0.625rem 0.75rem;
    }

    .selected-person span {
      display: grid;
      gap: 0.15rem;
      min-width: 0;
    }

    .candidate-list {
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
      max-height: 14rem;
      overflow: auto;
    }

    .candidate-list button {
      text-align: start;
    }

    .correction-note {
      background: var(--mat-sys-surface-container-high);
      color: var(--mat-sys-on-surface-variant);
      margin: 0;
      padding: 0.75rem;
    }

    .error-message {
      color: var(--mat-sys-error);
      margin: 0;
    }

    @media (max-width: 640px) {
      .original-grid {
        grid-template-columns: 1fr;
      }

      .selected-person {
        grid-template-columns: auto minmax(0, 1fr);
      }

      .selected-person button {
        grid-column: 1 / -1;
        justify-self: start;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfflineAttendanceSubmissionEditDialogComponent {
  private readonly dialogRef = inject(
    MatDialogRef<
      OfflineAttendanceSubmissionEditDialogComponent,
      OfflineAttendanceSubmissionEditDialogResult | null
    >,
  );
  private readonly peopleApi = inject(PeopleApiService);
  private readonly formBuilder = inject(FormBuilder);

  readonly data = inject<OfflineAttendanceSubmissionEditDialogData>(MAT_DIALOG_DATA);
  readonly candidatePeople = signal<Person[]>([]);
  readonly errorMessage = signal<string | null>(null);
  readonly isSearching = signal(false);
  readonly isSaving = signal(false);
  readonly originalValue = signal(this.resolveOriginalValue());
  readonly searchValue = signal(this.resolveOriginalValue());
  readonly selectedPerson = signal<Person | null>(this.data.submission.person ?? null);
  readonly personSearch = this.formBuilder.nonNullable.control(this.resolveOriginalValue());
  readonly selectedPersonDetail = computed(() => {
    const person = this.selectedPerson();
    return person ? this.personSummary(person) : '';
  });
  readonly inferredSearchLabel = computed(() => this.inferSearchLabel(this.searchValue()));

  constructor() {
    this.personSearch.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => {
        this.searchValue.set(value);
        if (this.selectedPerson()) {
          this.selectedPerson.set(null);
        }
      });
  }

  async searchPeople(): Promise<void> {
    const query = this.personSearch.value.trim();
    if (!query) {
      this.candidatePeople.set([]);
      return;
    }

    this.errorMessage.set(null);
    this.isSearching.set(true);
    try {
      const searches = buildPeopleCandidateLookupFilters(query, 8).map((filters) =>
        firstValueFrom(this.peopleApi.listPeopleSummaries(filters)),
      );
      const results = await Promise.allSettled(searches);
      if (results.every((result) => result.status === 'rejected')) {
        throw results[0]?.reason;
      }

      const peopleById = new Map<string, Person>();
      for (const result of results) {
        if (result.status === 'fulfilled') {
          for (const person of result.value) {
            peopleById.set(person.id, person);
          }
        }
      }
      const people = [...peopleById.values()].slice(0, 8);
      this.candidatePeople.set(people);
      if (people.length === 0) {
        this.errorMessage.set('Nenhuma pessoa encontrada para a busca informada.');
      }
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Não foi possível buscar pessoas.');
    } finally {
      this.isSearching.set(false);
    }
  }

  selectPerson(person: Person): void {
    this.selectedPerson.set(person);
    this.personSearch.setValue(person.name, { emitEvent: false });
    this.searchValue.set(person.name);
    this.candidatePeople.set([]);
  }

  clearSelectedPerson(): void {
    this.selectedPerson.set(null);
  }

  save(): void {
    const person = this.selectedPerson();
    if (!person) {
      this.errorMessage.set('Selecione uma pessoa encontrada para salvar a correção.');
      return;
    }

    this.isSaving.set(true);
    this.dialogRef.close({
      personId: person.id,
    });
  }

  personSummary(person: Person): string {
    return [person.email, person.identityDocument, person.academicId].filter(Boolean).join(' · ') || person.id;
  }

  originalSourceLabel(): string {
    switch (this.data.submission.createdByMethod) {
      case 'SCANNER':
        return 'Código do crachá';
      case 'MANUAL_INPUT':
        return 'Entrada manual';
      default:
        return 'Origem incompatível';
    }
  }

  originalSourceIcon(): string {
    return this.data.submission.createdByMethod === 'SCANNER' ? 'qr_code_scanner' : 'edit_note';
  }

  private resolveOriginalValue(): string {
    if (this.data.submission.createdByMethod === 'SCANNER') {
      return this.data.submission.scannerCode ?? '';
    }

    if (this.data.submission.createdByMethod === 'MANUAL_INPUT') {
      return this.data.submission.manualValue ?? '';
    }

    return this.data.submission.manualValue ?? this.data.submission.scannerCode ?? '';
  }

  private inferSearchLabel(value: string): string {
    const query = value.trim();
    if (!query) {
      return 'Busca por nome, e-mail, telefone, documento, RA ou código de usuário';
    }

    if (parseUserAztecIdentifier(query)) {
      return 'Código de usuário detectado';
    }

    if (query.includes('@')) {
      return 'E-mail detectado';
    }

    const digits = query.replace(/\D/g, '');
    if (digits.length >= 10) {
      return 'Documento ou telefone detectado';
    }

    if (digits.length >= 6) {
      return 'Documento, telefone ou RA detectado';
    }

    return 'Busca por nome ou texto';
  }

}
