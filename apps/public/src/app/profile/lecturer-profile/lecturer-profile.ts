import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { catchError, map, of, startWith } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AttendancesApiService, LecturerProfile, LecturerProfileInput } from '../attendances/attendances-api.service';

type LecturerProfileState =
  | { status: 'loading' }
  | { status: 'ready'; profile: LecturerProfile | null }
  | { status: 'error'; message: string };

@Component({
  selector: 'app-lecturer-profile',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatToolbarModule,
  ],
  templateUrl: './lecturer-profile.html',
  styleUrl: './lecturer-profile.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LecturerProfileComponent {
  private readonly api = inject(AttendancesApiService);
  private readonly auth = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);
  readonly isEditing = signal(false);
  readonly isSaving = signal(false);
  readonly userPicture = computed(() => this.stringClaim('picture'));
  readonly fallbackName = computed(() => this.stringClaim('name') ?? this.auth.user()?.preferredUsername ?? '');

  readonly form = this.formBuilder.nonNullable.group({
    displayName: ['', [Validators.required]],
    biography: ['', [Validators.required]],
    publishGoogleUserPicture: [false],
    email: [''],
    whatsapp: [''],
  });

  readonly state = toSignal(
    this.api.getCurrentUserLecturerProfile().pipe(
      map((profile) => {
        this.populateForm(profile);
        return { status: 'ready', profile } satisfies LecturerProfileState;
      }),
      startWith({ status: 'loading' } satisfies LecturerProfileState),
      catchError((error: unknown) =>
        of({
          status: 'error',
          message: error instanceof Error ? error.message : 'Não foi possível carregar o perfil de ministrante.',
        } satisfies LecturerProfileState),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies LecturerProfileState },
  );

  edit(): void {
    if (!this.form.controls.displayName.value.trim()) {
      this.form.controls.displayName.setValue(this.fallbackName());
    }
    this.isEditing.set(true);
  }

  cancel(profile: LecturerProfile | null): void {
    this.populateForm(profile);
    this.isEditing.set(false);
  }

  save(): void {
    if (this.form.invalid || this.isSaving()) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const input: LecturerProfileInput = {
      displayName: raw.displayName.trim(),
      biography: raw.biography.trim(),
      publishGoogleUserPicture: raw.publishGoogleUserPicture,
      email: raw.email.trim() || null,
      whatsapp: this.normalizeWhatsapp(raw.whatsapp.trim()),
    };

    this.isSaving.set(true);
    this.api.upsertCurrentUserLecturerProfile(input).subscribe({
      next: (profile) => {
        this.populateForm(profile);
        this.isEditing.set(false);
        this.isSaving.set(false);
        this.snackBar.open('Perfil de ministrante salvo.', 'OK', { duration: 3000 });
      },
      error: (error: unknown) => {
        this.isSaving.set(false);
        this.snackBar.open(error instanceof Error ? error.message : 'Não foi possível salvar o perfil.', 'OK', {
          duration: 5000,
        });
      },
    });
  }

  whatsappHref(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    return `https://wa.me/${value.replace(/\D/g, '')}`;
  }

  private populateForm(profile: LecturerProfile | null): void {
    this.form.reset({
      displayName: profile?.displayName ?? '',
      biography: profile?.biography ?? '',
      publishGoogleUserPicture: profile?.publishGoogleUserPicture ?? false,
      email: profile?.email ?? '',
      whatsapp: profile?.whatsapp ?? '',
    });
  }

  private normalizeWhatsapp(value: string): string | null {
    if (!value) {
      return null;
    }

    const hasPlus = value.startsWith('+');
    const digits = value.replace(/\D/g, '');
    const normalized = hasPlus
      ? `+${digits}`
      : digits.length === 10 || digits.length === 11
        ? `+55${digits}`
        : `+${digits}`;

    return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : value;
  }

  private stringClaim(claim: string): string | null {
    const value = this.auth.user()?.claims?.[claim];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }
}
