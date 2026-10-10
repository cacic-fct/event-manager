import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { Person } from '@cacic-fct/event-manager-admin-contracts';
import type { AdminTicketEligibility } from '@cacic-fct/shared-ticketing';
import { firstValueFrom } from 'rxjs';
import { PeopleApiService } from '../graphql/people-api.service';
import { TicketAdminApiService } from '../graphql/ticket-admin-api.service';
import { Permission } from '@cacic-fct/shared-permissions';
import { PermissionsService } from '../permissions/permissions.service';
import { PersonSearchComponent } from '../people/person-search/person-search.component';
import { getErrorMessage } from '../feedback/error-message';

export interface TicketAdminPersonActionData {
  action: 'ISSUE' | 'TRANSFER';
  eventId: string;
  eventName: string;
  ticketName: string;
  ticketId?: string;
  holderName?: string;
}

@Component({
  selector: 'app-ticket-admin-person-action-dialog',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    PersonSearchComponent,
    ReactiveFormsModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.action === 'ISSUE' ? 'Emitir bilhete manualmente' : 'Iniciar transferência administrativa' }}</h2>
    <mat-dialog-content>
      <dl class="context-details">
        <div><dt>Bilhete</dt><dd>{{ data.ticketName }}</dd></div>
        <div><dt>Evento</dt><dd>{{ data.eventName }}</dd></div>
      </dl>
      @if (data.action === 'TRANSFER') {
        <p>O bilhete continua com {{ data.holderName }} até a pessoa destinatária confirmar a transferência.</p>
      } @else {
        <p>A emissão manual pode prosseguir mesmo quando a pessoa não atende aos critérios configurados.</p>
      }

      <app-person-search
        label="Buscar pessoa destinatária"
        resultActionLabel="Selecionar"
        [query]="personQuery()"
        [results]="people()"
        [loading]="searching()"
        [disabled]="!canSearchPeople() || saving()"
        [disabledReason]="'Buscar pessoas exige a permissão de leitura de pessoas relacionadas ao evento.'"
        (queryChange)="onQueryChange($event)"
        (searchRequested)="searchPeople($event)"
        (personSelected)="selectPerson($event)" />

      @if (selectedPerson(); as person) {
        <div class="selected-person" aria-live="polite">
          <mat-icon aria-hidden="true">person</mat-icon>
          <span><strong>{{ person.name }}</strong><small>{{ person.email || 'Sem e-mail principal' }}</small></span>
        </div>
      }

      @if (eligibilityLoading()) {
        <div class="eligibility-progress" aria-live="polite"><mat-spinner diameter="20" /> Verificando critérios do bilhete...</div>
      } @else if (eligibility(); as result) {
        @if (result.warnings.length) {
          <section class="eligibility-warning" [attr.role]="data.action === 'ISSUE' ? 'status' : 'alert'">
            <mat-icon aria-hidden="true">warning</mat-icon>
            <div>
              <strong>{{ data.action === 'ISSUE' ? 'A pessoa não atende a todos os critérios' : 'Esta pessoa não pode receber o bilhete' }}</strong>
              @for (warning of result.warnings; track warning.code) {
                <p>{{ warning.message }}</p>
              }
              @if (data.action === 'ISSUE') {
                <p>A administração pode continuar com a emissão.</p>
              }
            </div>
          </section>
        } @else {
          <p class="eligible-message" role="status">A pessoa atende aos critérios configurados para este bilhete.</p>
        }
      }

      @if (error()) {
        <p class="error-message" role="alert">{{ error() }}</p>
      }

      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="reason-field">
        <mat-label>Motivo para auditoria</mat-label>
        <textarea matInput rows="3" maxlength="500" [formControl]="reasonControl" required></textarea>
        <mat-hint>O motivo será registrado no histórico administrativo do bilhete.</mat-hint>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close [disabled]="saving()">Cancelar</button>
      <button matButton="filled" type="button" [disabled]="!canSubmit()" (click)="submit()">
        @if (saving()) { Processando... }
        @else if (data.action === 'ISSUE') { Emitir bilhete }
        @else { Enviar para confirmação }
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content { display: grid; gap: 1rem; }
    .context-details { display:grid; gap:0.5rem; margin:0; }
    .context-details > div { display:grid; gap:0.15rem; }
    .context-details dt { color:var(--mat-sys-on-surface-variant); font:var(--mat-sys-body-small); }
    .context-details dd { margin:0; color:var(--mat-sys-on-surface); overflow-wrap:anywhere; }
    .selected-person { display:flex; gap:0.75rem; align-items:center; }
    .selected-person span { display:grid; gap:0.2rem; min-width:0; }
    .selected-person small { color:var(--mat-sys-on-surface-variant); }
    .eligibility-progress { display:flex; gap:0.5rem; align-items:center; color:var(--mat-sys-on-surface-variant); }
    .eligibility-warning { display:flex; gap:0.75rem; padding:0.875rem; border:1px solid var(--mat-sys-outline-variant); border-radius:8px; background:var(--mat-sys-surface-container-low); }
    .eligibility-warning mat-icon { flex:0 0 auto; color:var(--mat-sys-error); }
    .eligibility-warning p { margin:0.4rem 0 0; }
    .eligible-message { margin:0; color:var(--mat-sys-on-surface-variant); }
    .error-message { margin:0; color:var(--mat-sys-error); }
    .reason-field { width:100%; }
  `,
})
export class TicketAdminPersonActionDialogComponent {
  protected readonly data = inject<TicketAdminPersonActionData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<TicketAdminPersonActionDialogComponent>);
  private readonly peopleApi = inject(PeopleApiService);
  private readonly ticketApi = inject(TicketAdminApiService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly permissions = inject(PermissionsService);
  protected readonly canSearchPeople = () => this.permissions.has(Permission.RelatedPerson.Read);
  protected readonly personQuery = signal('');
  protected readonly people = signal<Person[]>([]);
  protected readonly selectedPerson = signal<Person | null>(null);
  protected readonly searching = signal(false);
  protected readonly eligibilityLoading = signal(false);
  protected readonly eligibility = signal<AdminTicketEligibility | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly reasonControl = this.formBuilder.nonNullable.control('', [Validators.required, Validators.maxLength(500)]);
  private searchRequest = 0;
  private eligibilityRequest = 0;

  protected onQueryChange(query: string): void {
    this.personQuery.set(query);
    this.selectedPerson.set(null);
    this.eligibility.set(null);
    this.people.set([]);
    this.error.set(null);
  }

  protected async searchPeople(query: string): Promise<void> {
    const request = ++this.searchRequest;
    if (!query || !this.canSearchPeople()) {
      this.people.set([]);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    try {
      const people = await firstValueFrom(this.peopleApi.listRelatedPeople({ query, eventId: this.data.eventId, take: 10 }));
      if (request === this.searchRequest) this.people.set(people);
    } catch (error) {
      if (request === this.searchRequest) this.error.set(getErrorMessage(error, 'Não foi possível buscar pessoas.'));
    } finally {
      if (request === this.searchRequest) this.searching.set(false);
    }
  }

  protected selectPerson(person: Person): void {
    this.selectedPerson.set(person);
    this.personQuery.set(person.name);
    this.people.set([]);
    this.error.set(null);
    void this.checkEligibility(person.id);
  }

  protected canSubmit(): boolean {
    const eligibility = this.eligibility();
    const canProceed = this.data.action === 'ISSUE' ? eligibility !== null : eligibility?.eligible === true;
    return Boolean(
      !this.saving() &&
        !this.searching() &&
        !this.eligibilityLoading() &&
        this.selectedPerson() &&
        canProceed &&
        (this.data.action !== 'TRANSFER' || this.data.ticketId) &&
        this.reasonControl.valid &&
        this.reasonControl.value.trim(),
    );
  }

  protected async submit(): Promise<void> {
    const person = this.selectedPerson();
    const reason = this.reasonControl.value.trim();
    if (!person || !reason || !this.canSubmit()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      if (this.data.action === 'ISSUE') {
        await firstValueFrom(this.ticketApi.issueTicket({ eventId: this.data.eventId, personId: person.id, reason }));
      } else if (this.data.ticketId) {
        await firstValueFrom(this.ticketApi.startTransfer({ ticketId: this.data.ticketId, recipientPersonId: person.id, reason }));
      }
      this.dialogRef.close(true);
    } catch (error) {
      this.error.set(getErrorMessage(error, 'Não foi possível concluir a operação.'));
    } finally {
      this.saving.set(false);
    }
  }

  private async checkEligibility(personId: string): Promise<void> {
    const request = ++this.eligibilityRequest;
    this.eligibilityLoading.set(true);
    this.eligibility.set(null);
    try {
      const result = await firstValueFrom(this.ticketApi.getEligibilityWarnings(this.data.eventId, personId));
      if (request === this.eligibilityRequest) this.eligibility.set(result);
    } catch (error) {
      if (request === this.eligibilityRequest) this.error.set(getErrorMessage(error, 'Não foi possível verificar os critérios do bilhete.'));
    } finally {
      if (request === this.eligibilityRequest) this.eligibilityLoading.set(false);
    }
  }
}
