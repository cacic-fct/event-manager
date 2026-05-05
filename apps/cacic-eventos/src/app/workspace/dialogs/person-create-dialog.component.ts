import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';
import { PeopleApiService } from '../../graphql/people-api.service';
import { Person } from '../../graphql/models';

@Component({
  selector: 'app-person-create-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title>Criar pessoa</h2>
    <div mat-dialog-content>
      <form [formGroup]="form" class="form">
        <mat-form-field>
          <mat-label>Nome</mat-label>
          <input matInput formControlName="name" />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Email</mat-label>
          <input matInput formControlName="email" />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Documento</mat-label>
          <input matInput formControlName="identityDocument" />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Matrícula (RA)</mat-label>
          <input matInput formControlName="academicId" />
        </mat-form-field>

        @if (errorMessage()) {
          <p class="error">{{ errorMessage() }}</p>
        }
      </form>
    </div>
    <div mat-dialog-actions>
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button (click)="onSaveClick()" [disabled]="isSaving()">
        @if (isSaving()) {
          <mat-spinner diameter="16"></mat-spinner>
        } @else {
          Criar pessoa
        }
      </button>
    </div>
  `,
  styles: [
    `
      .form {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
        gap: 0.75rem;
        margin-top: 0.5rem;
      }

      .error {
        color: var(--mat-sys-error);
        margin: 0;
      }
    `,
  ],
})
export class PersonCreateDialogComponent {
  private readonly dialogRef = inject(
    MatDialogRef<PersonCreateDialogComponent, Person | null>,
  );
  private readonly formBuilder = inject(FormBuilder);
  private readonly api = inject(PeopleApiService);

  readonly isSaving = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: [''],
    identityDocument: [''],
    academicId: [''],
  });

  async onSaveClick(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.isSaving.set(true);

    try {
      const rawValue = this.form.getRawValue();
      const duplicateCandidates = await firstValueFrom(
        this.api.listPeople({
          query: rawValue.name,
          email: rawValue.email || undefined,
          identityDocument: rawValue.identityDocument || undefined,
          take: 10,
        }),
      );

      const normalizedName = rawValue.name.trim().toLowerCase();
      const normalizedEmail = rawValue.email.trim().toLowerCase();
      const normalizedIdentityDocument = rawValue.identityDocument.trim();

      const duplicate = duplicateCandidates.find((candidate) => {
        if (
          normalizedIdentityDocument &&
          candidate.identityDocument === normalizedIdentityDocument
        ) {
          return true;
        }

        if (
          normalizedEmail &&
          candidate.email?.trim().toLowerCase() === normalizedEmail
        ) {
          return true;
        }

        return candidate.name.trim().toLowerCase() === normalizedName;
      });

      if (duplicate) {
        this.errorMessage.set(
          `Já existe uma pessoa (${duplicate.name}, id: ${duplicate.id}).`,
        );
        return;
      }

      const createdPerson = await firstValueFrom(
        this.api.createPerson({
          name: rawValue.name.trim(),
          email: rawValue.email.trim() || null,
          identityDocument: rawValue.identityDocument.trim() || null,
          academicId: rawValue.academicId.trim() || null,
        }),
      );

      this.dialogRef.close(createdPerson);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'Não foi possível criar a pessoa.',
      );
    } finally {
      this.isSaving.set(false);
    }
  }
}
