import { Component, computed, effect, input, linkedSignal, output, signal } from '@angular/core';
import { FormField, form, maxLength, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  transferPersonDataError,
  type TransferPersonData,
  type TransferPersonDecision,
  type TransferPersonPrompt,
} from '@cacic-fct/shared-data-transfer';

type PersonAction = TransferPersonDecision['action'];
type IdentifierField = Exclude<keyof TransferPersonData, 'name'>;
const identifierFields: Array<{ field: IdentifierField; label: string }> = [
  { field: 'email', label: 'E-mail' },
  { field: 'academicId', label: 'Matrícula (RA)' },
  { field: 'identityDocument', label: 'Documento' },
  { field: 'phone', label: 'Telefone' },
];

@Component({
  selector: 'app-transfer-person-review',
  imports: [FormField, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <form (submit)="$event.preventDefault(); confirm()" aria-label="Revisar pessoa da importação">
      <h4>{{ prompt().data.name || 'Pessoa sem nome no arquivo' }}</h4>
      @if (importedDetails()) {
        <p class="details">{{ importedDetails() }}</p>
      }
      <div class="person-fields">
        <mat-form-field>
          <mat-label>Ação para esta pessoa</mat-label>
          <mat-select [value]="action()" [disabled]="locked()" (selectionChange)="action.set($event.value)">
            @if (prompt().canCreate !== false) {
              <mat-option value="create">Criar nova pessoa</mat-option>
            }
            @if (prompt().canMerge) {
              <mat-option value="merge">Mesclar com cadastro existente</mat-option>
            }
            <mat-option value="skip">Ignorar registros</mat-option>
          </mat-select>
        </mat-form-field>
        @if (action() === 'merge') {
          <mat-form-field>
            <mat-label>Pessoa existente</mat-label>
            <mat-select
              [value]="selectedPersonId()"
              [disabled]="locked()"
              (selectionChange)="selectedPersonId.set($event.value)">
              @for (candidate of prompt().candidates; track candidate.id) {
                <mat-option [value]="candidate.id"
                  >{{ candidate.name }}:
                  {{
                    candidate.email ||
                      candidate.academicId ||
                      candidate.identityDocument ||
                      candidate.phone ||
                      candidate.id
                  }}</mat-option
                >
              }
            </mat-select>
          </mat-form-field>
        }
        @if (action() !== 'skip' && !nameIsLocked()) {
          <mat-form-field>
            <mat-label>Nome completo</mat-label>
            <input matInput [formField]="personForm.name" [readOnly]="locked()" />
          </mat-form-field>
        }
        @if (action() !== 'skip' && showAdditionalData() && availableIdentifiers().length) {
          <mat-form-field>
            <mat-label>Dado adicional</mat-label>
            <mat-select [value]="extraField()" [disabled]="locked()" (selectionChange)="changeExtraField($event.value)">
              @for (identifier of availableIdentifiers(); track identifier.field) {
                <mat-option [value]="identifier.field">{{ identifier.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ extraLabel() }}</mat-label>
            <input
              matInput
              [type]="extraField() === 'email' ? 'email' : extraField() === 'phone' ? 'tel' : 'text'"
              [formField]="personForm[extraField()]"
              [readOnly]="locked()" />
            @if (extraField() === 'phone') {
              <mat-hint>Com código do país, como +442071838750, ou DDD brasileiro.</mat-hint>
            }
          </mat-form-field>
        }
      </div>
      @if (action() === 'merge') {
        <p class="details">O e-mail principal será preservado. Confira os dados mesclados na próxima revisão.</p>
      }
      @if (error()) {
        <p class="error" role="status">{{ error() }}</p>
      }
      @if (serverMessage()) {
        <p class="error" role="status">{{ serverMessage() }}</p>
      }
      <div class="actions">
        <button
          mat-flat-button
          type="submit"
          [disabled]="locked() || !!error() || (action() === 'merge' && !selectedPersonId()) || !!choice()">
          {{
            action() === 'create'
              ? 'Confirmar criação'
              : action() === 'merge'
                ? 'Confirmar mesclagem'
                : 'Confirmar ignorar'
          }}
        </button>
        @if (action() !== 'skip' && !showAdditionalData() && availableIdentifiers().length) {
          <button mat-button type="button" [disabled]="locked()" (click)="additionalDataOpen.set(true)">
            Complementar dados
          </button>
        }
        @if (choice()) {
          <span role="status">{{
            choice() === 'create'
              ? 'Criação confirmada.'
              : choice() === 'merge'
                ? 'Mesclagem confirmada.'
                : 'Pessoa ignorada.'
          }}</span>
        }
      </div>
    </form>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    form {
      margin-block: 1.5rem;
    }
    h4 {
      margin-block: 0 0.5rem;
    }
    h4,
    p {
      overflow-wrap: anywhere;
    }
    .details {
      color: var(--mat-sys-on-surface-variant);
      margin-block: 0 0.75rem;
    }
    .person-fields {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
      gap: 0.75rem;
    }
    .actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.75rem;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class TransferPersonReviewComponent {
  readonly prompt = input.required<TransferPersonPrompt>();
  readonly locked = input(false);
  readonly decision = output<TransferPersonDecision>();
  readonly edited = output<string>();
  protected readonly choice = signal<PersonAction | null>(null);
  protected readonly action = linkedSignal<PersonAction>(() => (this.prompt().canMerge ? 'merge' : 'create'));
  protected readonly selectedPersonId = signal('');
  protected readonly additionalDataOpen = signal(false);
  protected readonly nameIsLocked = computed(
    () => this.prompt().lockedFields?.includes('name') ?? !!this.prompt().data.name,
  );
  protected readonly availableIdentifiers = computed(() =>
    identifierFields.filter(
      ({ field }) => !(this.prompt().lockedFields?.includes(field) ?? !!this.prompt().data[field]),
    ),
  );
  protected readonly extraField = linkedSignal<IdentifierField>(() => this.availableIdentifiers()[0]?.field ?? 'email');
  protected readonly extraLabel = computed(
    () => identifierFields.find(({ field }) => field === this.extraField())?.label ?? 'Dado adicional',
  );
  protected readonly importedDetails = computed(() =>
    identifierFields
      .flatMap(({ field, label }) => (this.prompt().data[field] ? [`${label}: ${this.prompt().data[field]}`] : []))
      .join('; '),
  );
  protected readonly showAdditionalData = computed(
    () =>
      this.additionalDataOpen() ||
      (this.action() === 'create' && !identifierFields.some(({ field }) => this.prompt().data[field])),
  );
  protected readonly model = linkedSignal(() => ({
    name: this.prompt().data.name ?? '',
    email: this.prompt().data.email ?? '',
    academicId: this.prompt().data.academicId ?? '',
    identityDocument: this.prompt().data.identityDocument ?? '',
    phone: this.prompt().data.phone ?? '',
  }));
  protected readonly personForm = form(this.model, (path) => {
    required(path.name);
    maxLength(path.name, 300);
    maxLength(path.email, 300);
    maxLength(path.phone, 40);
    maxLength(path.identityDocument, 40);
    maxLength(path.academicId, 40);
  });
  protected readonly error = computed(() =>
    this.action() === 'skip' ? '' : (transferPersonDataError(this.model(), this.action() === 'create') ?? ''),
  );
  protected readonly serverMessage = computed(() => {
    if (this.action() === 'skip') return '';
    const message = this.prompt().message;
    return message === this.error() ||
      message.startsWith('Nenhuma pessoa') ||
      message.startsWith('O nome corresponde') ||
      message.startsWith('Além do nome completo')
      ? ''
      : message;
  });

  constructor() {
    effect(() => {
      this.model();
      this.action();
      this.selectedPersonId();
      this.choice.set(null);
      this.edited.emit(this.prompt().key);
    });
  }

  protected changeExtraField(field: IdentifierField): void {
    if (this.locked()) return;
    const previous = this.extraField();
    this.model.update((model) => ({ ...model, [previous]: '' }));
    this.extraField.set(field);
  }

  protected confirm(): void {
    if (this.locked() || this.error()) return;
    const key = this.prompt().key;
    const action = this.action();
    if (action === 'skip') {
      this.choice.set(action);
      this.decision.emit({ key, action });
      return;
    }
    if (action === 'create' && this.prompt().canCreate === false) return;
    if (action === 'merge' && (!this.prompt().canMerge || !this.selectedPersonId())) return;
    const data = Object.fromEntries(
      Object.entries(this.model()).flatMap(([field, value]) => (value.trim() ? [[field, value.trim()]] : [])),
    );
    const review = this.prompt().reviewHash ? { reviewHash: this.prompt().reviewHash } : {};
    this.choice.set(action);
    this.decision.emit(
      action === 'create'
        ? { key, action, data, ...review }
        : { key, action, personId: this.selectedPersonId(), data, ...review },
    );
  }
}
